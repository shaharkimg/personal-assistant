import { useCallback, useRef, useState } from "react";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as Haptics from "expo-haptics";
import { transcriptionService } from "@/services/transcription/TranscriptionService";

export type VoiceState = "idle" | "recording" | "transcribing" | "error";

const MAX_SECONDS = 120;

/**
 * Voice recording -> Speech-to-Text. Returns the transcript; the caller sends it to the assistant.
 * Audio is recorded locally, uploaded once for transcription and not stored.
 */
export function useVoiceInput(onTranscript: (text: string) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder, 250);
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (!recorder.isRecording) return;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    const uri = recorder.uri;
    if (!uri) {
      setState("idle");
      return;
    }
    setState("transcribing");
    try {
      const text = (await transcriptionService.transcribe(uri, { language: "he" })).trim();
      setState("idle");
      if (text) onTranscript(text);
      else setError("לא זוהה דיבור");
    } catch (e) {
      setState("error");
      setError(
        (e as { code?: string }).code === "transcription_not_configured"
          ? "זיהוי דיבור לא מוגדר בשרת (חסר מפתח OpenAI). אפשר להקליד."
          : "התמלול נכשל. נסה שוב או הקלד.",
      );
    }
  }, [recorder, onTranscript]);

  const start = useCallback(async () => {
    setError(null);
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setState("error");
      setError("כדי לדבר עם העוזר צריך לאשר גישה למיקרופון בהגדרות.");
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    setState("recording");
    timer.current = setTimeout(() => void stop(), MAX_SECONDS * 1000);
  }, [recorder, stop]);

  const toggle = useCallback(() => (state === "recording" ? stop() : start()), [state, start, stop]);

  return { state, error, toggle, start, stop, seconds: Math.floor((recState.durationMillis ?? 0) / 1000), metering: recState.metering };
}
