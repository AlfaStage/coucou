// Microphone capture for local dictation.
//
// Records straight to 16 kHz mono PCM in the webview (the format Whisper wants, so
// nothing has to decode or convert it later), hands the WAV to the local engine in
// Rust and either types the text where the cursor is or just copies it. Nothing
// leaves the machine. The island never takes keyboard focus for this, so "type"
// mode writes into whichever window you were already in.

import { State } from "../core/state";
import { Bridge, onEvent, type WhisperSetupProgress } from "../core/bridge";
import { Sound } from "../core/sound";
import { copyText } from "../views/tools";

const SAMPLE_RATE = 16_000;
const MAX_SECONDS = 90;

let stream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let processor: ScriptProcessorNode | null = null;
let chunks: Float32Array[] = [];
let autoStop = 0;

export async function toggleListening(mode: "type" | "copy" = State.whisper.mode): Promise<void> {
  if (State.whisper.phase === "listening") stopListening();
  else await startListening(mode);
}

function fail(message: string) {
  State.whisper.phase = "idle";
  State.whisper.error = message;
  Sound.play("error");
  State.notify();
}

function releaseMic() {
  window.clearTimeout(autoStop);
  processor?.disconnect();
  processor = null;
  void audioCtx?.close();
  audioCtx = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  State.whisper.level = 0;
}

/** Float32 [-1, 1] samples → 16-bit PCM WAV, base64. */
function encodeWav(samples: Float32Array): string {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export async function startListening(mode: "type" | "copy" = State.whisper.mode): Promise<void> {
  if (State.whisper.phase !== "idle") return;
  State.whisper.mode = mode;
  State.whisper.error = null;

  // The engine is downloaded once, the first time. Offer it instead of recording
  // something that cannot be transcribed.
  const engine = await Bridge.whisperStatus();
  if (engine && engine.state !== "ready") {
    State.whisper.engine = engine.state;
    State.whisper.downloadMb = engine.downloadMb;
    State.notify();
    if (engine.state === "needs_setup") await startSetup();
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
  } catch {
    fail("Não consegui acessar o microfone. Libere o acesso nas configurações de privacidade do Windows.");
    return;
  }

  chunks = [];
  audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
  const source = audioCtx.createMediaStreamSource(stream);
  processor = audioCtx.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);
    State.whisper.level += (Math.min(1, rms * 6) - State.whisper.level) * 0.4;
  };
  source.connect(processor);
  processor.connect(audioCtx.destination); // required for the node to run; outputs silence
  autoStop = window.setTimeout(stopListening, MAX_SECONDS * 1000);

  State.whisper.phase = "listening";
  State.whisper.startedAt = performance.now();
  Sound.play("peek");
  State.notify();
}

export function stopListening(): void {
  if (State.whisper.phase !== "listening") return;
  const recorded = chunks;
  chunks = [];
  releaseMic();
  State.whisper.phase = "transcribing";
  State.notify();
  void transcribe(recorded, State.whisper.mode);
}

async function transcribe(recorded: Float32Array[], mode: "type" | "copy") {
  const total = recorded.reduce((n, c) => n + c.length, 0);
  if (total < SAMPLE_RATE * 0.4) {
    fail("Não ouvi nada. Fale um pouco mais perto do microfone.");
    return;
  }
  const samples = new Float32Array(total);
  let offset = 0;
  for (const c of recorded) {
    samples.set(c, offset);
    offset += c.length;
  }

  try {
    const text = await Bridge.whisperTranscribe(encodeWav(samples), mode, State.whisper.lang || "auto");
    State.whisper.lastTranscription = text;
    State.whisper.error = null;
    if (mode === "copy") await copyText(text);
    State.whisper.phase = "idle";
    Sound.play("finish");
    State.notify();
  } catch (err) {
    fail(String(err).replace(/^Error:\s*/, ""));
  }
}

// ── One-time engine download ──────────────────────────────────────────────────

export async function startSetup(): Promise<void> {
  State.whisper.engine = "setting_up";
  State.whisper.setupPercent = 0;
  State.whisper.error = null;
  State.notify();
  await Bridge.whisperSetup();
}

let listening = false;

/** Keeps State in step with the download happening in Rust. */
export function watchWhisperSetup() {
  if (listening) return;
  listening = true;
  void onEvent<WhisperSetupProgress>("whisper-setup", (p) => {
    if (p.stage === "error") {
      State.whisper.engine = "needs_setup";
      State.whisper.error = p.message ?? "Não consegui baixar o motor de voz.";
      Sound.play("error");
    } else if (p.stage === "done") {
      State.whisper.engine = "ready";
      State.whisper.setupPercent = 100;
      Sound.play("finish");
    } else {
      State.whisper.engine = "setting_up";
      State.whisper.setupPercent = p.percent;
    }
    State.notify();
  });
}
