import { expect, it, vi } from "vitest";
vi.mock("@/data/db", () => ({ supabase: {}, logActivity: vi.fn(), fromRow: vi.fn(), toRow: vi.fn(), unwrap: vi.fn(), likePattern: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/services/ai/gateway", () => ({}));
vi.mock("@/services/briefData", () => ({}));
vi.mock("@/services/calendar/CalendarService", () => ({}));
vi.mock("@/services/contacts/ContactsService", () => ({}));
vi.mock("@/services/documents/DocumentService", () => ({}));
vi.mock("@/services/messaging/MessagingService", () => ({}));
it("every tool has a valid name and object schema for the model", async () => {
  const { toolRegistry } = await import("@/assistant/tools");
  const defs = toolRegistry.definitions();
  // Limits enforced by supabase/functions/ai-chat (requests over them are rejected with 400).
  expect(defs.length).toBeLessThanOrEqual(64);
  for (const d of defs) {
    expect(d.name).toMatch(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/);
    expect(d.description.length).toBeLessThanOrEqual(2000);
    expect((d.inputSchema as { type?: string }).type).toBe("object");
    expect(d.description.length).toBeGreaterThan(10);
  }
});
