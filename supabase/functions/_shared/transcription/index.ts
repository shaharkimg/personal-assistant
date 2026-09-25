import OpenAI, { toFile } from "npm:openai@7";
import type { TranscriptionProvider } from "../ai/types.ts";

/**
 * Speech-to-text over any OpenAI-compatible transcription endpoint
 * (OpenAI gpt-4o-transcribe / whisper-1, Groq whisper-large-v3, self-hosted whisper servers...).
 * Adding a non-compatible vendor = one more class implementing TranscriptionProvider.
 */
class OpenAICompatibleTranscription implements TranscriptionProvider {
  readonly name: string;
  private client: OpenAI;

  constructor(apiKey: string, private model: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, baseURL });
    this.name = baseURL ? `openai-compatible:${new URL(baseURL).host}` : "openai";
  }

  async transcribe(audio: Blob, opts: { language?: string; fileName: string }) {
    const file = await toFile(audio, opts.fileName);
    const res = await this.client.audio.transcriptions.create({
      file,
      model: this.model,
      ...(opts.language ? { language: opts.language } : {}),
    });
    return { text: res.text.trim(), language: opts.language };
  }
}

export function getTranscriptionProvider(): TranscriptionProvider {
  const key = Deno.env.get("TRANSCRIPTION_API_KEY") ?? Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("missing secret TRANSCRIPTION_API_KEY");
  return new OpenAICompatibleTranscription(
    key,
    Deno.env.get("TRANSCRIPTION_MODEL") ?? "gpt-4o-transcribe",
    Deno.env.get("TRANSCRIPTION_BASE_URL") ?? undefined,
  );
}
