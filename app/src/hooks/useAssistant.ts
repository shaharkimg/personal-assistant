import { useCallback, useEffect, useRef } from "react";
import * as Crypto from "expo-crypto";
import { createAssistantSession, ensureConversation } from "@/assistant/session";
import type { AssistantEngine, TurnResult } from "@/assistant/engine";
import { turnContext } from "@/assistant/prompt";
import type { AIContentBlock } from "@/services/ai/types";
import { ingestFiles, readBase64, type LocalFile } from "@/services/documents/DocumentService";
import { invalidateAll } from "@/state/queries";
import { useChat } from "@/state/chat";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

/** Binds one AssistantEngine to the chat UI state. */
export function useAssistant(opts: { conversationId?: string | null; mode?: "chat" | "quick_capture" } = {}) {
  const engineRef = useRef<AssistantEngine | null>(null);
  const ready = useRef<Promise<AssistantEngine> | null>(null);
  const { add, setBusy, setPending } = useChat();

  const getEngine = useCallback(() => {
    if (!ready.current) {
      ready.current = createAssistantSession({
        mode: opts.mode,
        conversationId: opts.conversationId ?? null,
        onEvent: (e) => {
          if (e.type === "thinking") setBusy("חושב…");
          if (e.type === "tool_started") setBusy(`${e.label}…`);
        },
      }).then((e) => (engineRef.current = e));
    }
    return ready.current;
  }, [opts.conversationId, opts.mode, setBusy]);

  useEffect(() => {
    void getEngine();
  }, [getEngine]);

  const handleResult = useCallback(
    (res: TurnResult) => {
      setBusy(null);
      if (res.text) add({ id: Crypto.randomUUID(), role: "assistant", text: res.text, actions: res.actions, error: res.status === "error" });
      else if (res.actions.length && res.status === "done") add({ id: Crypto.randomUUID(), role: "assistant", text: "בוצע.", actions: res.actions });
      setPending(res.status === "needs_confirmation" ? res.pending : null);
      if (res.actions.length) invalidateAll();
      return res;
    },
    [add, setBusy, setPending],
  );

  const send = useCallback(
    async (text: string, files: LocalFile[] = []): Promise<TurnResult> => {
      const engine = await getEngine();
      const content: AIContentBlock[] = [{ type: "text", text: turnContext(new Date()) }];
      const display = text.trim();
      add({
        id: Crypto.randomUUID(),
        role: "user",
        text: display,
        attachmentName: files.find((f) => !f.mimeType.startsWith("image/"))?.name,
        imageUri: files.find((f) => f.mimeType.startsWith("image/"))?.uri,
      });
      setPending(null);
      setBusy("מעבד…");

      for (const f of files) {
        const id = `a${engine.attachments.size + 1}`;
        engine.attachments.set(id, { id, file: f });
        if ((IMAGE_TYPES as readonly string[]).includes(f.mimeType)) {
          content.push({ type: "image", mediaType: f.mimeType as ImageType, data: await readBase64(f.uri) });
          content.push({ type: "text", text: `[attachment id=${id} image name="${f.name}"]` });
        } else {
          setBusy("קורא את הקובץ…");
          const { document } = await ingestFiles([f], { source: "chat" });
          content.push({ type: "text", text: `[attachment id=${id} file name="${f.name}" savedAsDocument=${document.id} status=${document.status}]` });
          invalidateAll();
        }
      }
      content.push({ type: "text", text: display || "(ללא טקסט)" });

      await ensureConversation(engine, display || files[0]?.name || "שיחה");
      return handleResult(await engine.send(content, display));
    },
    [add, getEngine, handleResult, setBusy, setPending],
  );

  const resolve = useCallback(
    async (decision: "confirm" | "cancel", edited?: Record<string, unknown>) => {
      const engine = await getEngine();
      setPending(null);
      if (decision === "cancel") add({ id: Crypto.randomUUID(), role: "system", text: "הפעולה בוטלה" });
      setBusy(decision === "confirm" ? "מבצע…" : null);
      return handleResult(await engine.resolve(decision, edited));
    },
    [add, getEngine, handleResult, setBusy, setPending],
  );

  return { send, resolve };
}
