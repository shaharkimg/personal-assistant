import type { AIContentBlock, AIMessage } from "@/services/ai/types";
import { fromRow, logActivity, supabase, unwrap } from "./db";

export interface ConversationSummary {
  id: string;
  title: string | null;
  projectId: string | null;
  updatedAt: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  text: string | null;
  blocks: AIContentBlock[] | { content: AIContentBlock[]; providerState?: AIMessage["providerState"] };
  createdAt: string;
}

export async function createConversation(title: string | null, projectId: string | null = null): Promise<string> {
  const row = unwrap(await supabase.from("conversations").insert({ title, project_id: projectId }).select("id").single());
  return row.id as string;
}

export async function listConversations(limit = 30): Promise<ConversationSummary[]> {
  return unwrap(await supabase.from("conversations").select("id, title, project_id, updated_at").order("updated_at", { ascending: false }).limit(limit)).map(
    (r) => fromRow<ConversationSummary>(r),
  );
}

export async function loadMessages(conversationId: string, limit = 60): Promise<StoredMessage[]> {
  const rows = unwrap(
    await supabase.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(limit),
  );
  return rows.reverse().map((r) => fromRow<StoredMessage>(r));
}

/** Persists one model-visible message. Base64 attachments are stripped (files live in storage). */
export async function appendMessage(conversationId: string, message: AIMessage, text: string | null): Promise<void> {
  const content = message.content.map((b) =>
    b.type === "image" || b.type === "document" ? ({ type: "text", text: "[קובץ מצורף]" } as AIContentBlock) : b,
  );
  unwrap(
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: message.role,
      text,
      blocks: { content, providerState: message.providerState },
    }),
  );
  await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
}

export async function deleteConversation(id: string) {
  unwrap(await supabase.from("conversations").delete().eq("id", id));
  await logActivity("user", "conversation.deleted", "נמחקה שיחה", { type: "conversation", id });
}

export async function deleteAllConversations() {
  unwrap(await supabase.from("conversations").delete().not("id", "is", null));
  await logActivity("user", "conversation.cleared", "נמחקה כל היסטוריית השיחות");
}
