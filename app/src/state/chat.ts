import { create } from "zustand";
import type { PendingConfirmation } from "@/assistant/engine";
import type { LocalFile } from "@/services/documents/DocumentService";

export interface ChatItem {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  actions?: string[];
  attachmentName?: string;
  imageUri?: string;
  error?: boolean;
}

interface ChatState {
  items: ChatItem[];
  busyLabel: string | null;
  pending: PendingConfirmation | null;
  /** A message composed elsewhere (home, share, notification) waiting to be sent by the chat screen. */
  outbox: { text: string; files: LocalFile[] } | null;
  setOutbox: (o: { text: string; files: LocalFile[] } | null) => void;
  add: (item: ChatItem) => void;
  setBusy: (label: string | null) => void;
  setPending: (p: PendingConfirmation | null) => void;
  reset: (items?: ChatItem[]) => void;
}

export const useChat = create<ChatState>((set) => ({
  items: [],
  busyLabel: null,
  pending: null,
  outbox: null,
  setOutbox: (outbox) => set({ outbox }),
  add: (item) => set((s) => ({ items: [...s.items, item] })),
  setBusy: (busyLabel) => set({ busyLabel }),
  setPending: (pending) => set({ pending }),
  reset: (items = []) => set({ items, pending: null, busyLabel: null }),
}));
