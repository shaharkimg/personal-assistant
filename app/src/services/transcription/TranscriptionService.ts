import { callFunctionForm } from "@/lib/supabase";

/**
 * Speech-to-text abstraction. The default implementation uploads the recording to the
 * /transcribe edge function (which picks the vendor from server config). An on-device
 * implementation (e.g. platform speech recognition) can be dropped in without touching callers.
 */
export interface TranscriptionService {
  transcribe(fileUri: string, opts?: { language?: string; mimeType?: string }): Promise<string>;
}

export class EdgeTranscriptionService implements TranscriptionService {
  async transcribe(fileUri: string, opts: { language?: string; mimeType?: string } = {}): Promise<string> {
    console.log("EdgeTranscriptionService: starting transcribe", { fileUri, language: opts.language });
    const form = new FormData();
    const name = fileUri.split("/").pop() || "recording.m4a";
    // React Native FormData accepts { uri, name, type } file descriptors.
    form.append("audio", { uri: fileUri, name, type: opts.mimeType ?? "audio/m4a" } as unknown as Blob);
    form.append("language", opts.language ?? "he");
    console.log("EdgeTranscriptionService: calling transcribe function");
    try {
      const res = await callFunctionForm<{ text: string }>("transcribe", form);
      console.log("EdgeTranscriptionService: success", { text: res.text?.slice(0, 50) });
      return res.text;
    } catch (e) {
      console.error("EdgeTranscriptionService: error", e);
      throw e;
    }
  }
}

export const transcriptionService: TranscriptionService = new EdgeTranscriptionService();
