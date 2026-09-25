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
    const form = new FormData();
    const name = fileUri.split("/").pop() || "recording.m4a";
    // React Native FormData accepts { uri, name, type } file descriptors.
    form.append("audio", { uri: fileUri, name, type: opts.mimeType ?? "audio/m4a" } as unknown as Blob);
    form.append("language", opts.language ?? "he");
    const res = await callFunctionForm<{ text: string }>("transcribe", form);
    return res.text;
  }
}

export const transcriptionService: TranscriptionService = new EdgeTranscriptionService();
