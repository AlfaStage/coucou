// Client-side microphone capture and Whisper transcription manager for Coucou.
// Records audio locally, sends to local Whisper model (zero tokens), and injects text.

import { State } from "../core/state";
import { Bridge } from "../core/bridge";
import { Sound } from "../core/sound";

let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];

export async function toggleListening(mode: "type" | "prompt" = "type"): Promise<void> {
  if (State.whisper.isListening) {
    stopListening();
  } else {
    await startListening(mode);
  }
}

export async function startListening(mode: "type" | "prompt" = "type"): Promise<void> {
  if (State.whisper.isListening) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      // Stop all tracks to release microphone hardware immediately
      stream.getTracks().forEach((track) => track.stop());

      if (audioChunks.length === 0) {
        State.whisper.isListening = false;
        State.notify();
        return;
      }

      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      const reader = new FileReader();

      reader.onloadend = async () => {
        const base64 = reader.result as string;
        try {
          const res = await Bridge.whisperTranscribe(base64, mode);
          if (res) {
            State.whisper.lastTranscription = res;
            if (mode === "prompt") {
              State.promptContext = { kind: "file", name: "Voice Note", path: res };
              State.view = "prompt";
            }
          }
          Sound.play("finish");
        } catch (err) {
          console.error("[whisper] transcription error:", err);
          Sound.play("error");
        } finally {
          State.whisper.isListening = false;
          State.notify();
        }
      };

      reader.readAsDataURL(audioBlob);
    };

    mediaRecorder.start();
    State.whisper.isListening = true;
    State.whisper.mode = mode;
    Sound.play("peek");
    State.notify();
  } catch (err) {
    console.error("[whisper] mic access error:", err);
    State.whisper.isListening = false;
    Sound.play("error");
    State.notify();
  }
}

export function stopListening(): void {
  if (!State.whisper.isListening || !mediaRecorder) return;
  try {
    if (mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
  } catch (err) {
    console.error("[whisper] stop error:", err);
  } finally {
    State.whisper.isListening = false;
    State.notify();
  }
}
