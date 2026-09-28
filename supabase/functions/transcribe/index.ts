// POST /transcribe — multipart form { audio: File, language?: string } -> { text }.
// Audio is streamed to the configured TranscriptionProvider and never stored.
import { handler, HttpError, json } from "../_shared/http.ts";
import { requireUser, startMeteredRequest } from "../_shared/auth.ts";
import { getTranscriptionProvider } from "../_shared/transcription/index.ts";

const MAX_BYTES = 20 * 1024 * 1024;

Deno.serve(handler(async (req) => {
  console.log("transcribe: starting");
  const { userId } = await requireUser(req);
  console.log("transcribe: user auth ok");
  const form = await req.formData().catch((e) => {
    console.error("transcribe: formData error", e);
    throw new HttpError(400, "expected multipart/form-data", "bad_request");
  });
  const audio = form.get("audio");
  if (!(audio instanceof File)) throw new HttpError(400, "missing audio", "bad_request");
  if (audio.size === 0 || audio.size > MAX_BYTES) throw new HttpError(413, "audio too large", "too_large");
  if (!/^audio\/|^video\/mp4$|^application\/octet-stream$/.test(audio.type || "application/octet-stream")) {
    throw new HttpError(415, "unsupported audio type", "unsupported");
  }
  const language = (form.get("language") as string | null) ?? undefined;
  console.log("transcribe: audio ok, size", audio.size, "type", audio.type, "language", language);

  await startMeteredRequest(userId);
  console.log("transcribe: metered request ok");
  try {
    const provider = getTranscriptionProvider();
    console.log("transcribe: provider ready", provider.name);
    const result = await provider.transcribe(audio, {
      language: language?.slice(0, 5),
      fileName: audio.name || "recording.m4a",
    });
    console.log("transcribe: success");
    return json(req, result);
  } catch (e) {
    console.error("transcribe: provider error", e);
    throw e;
  }
}));
