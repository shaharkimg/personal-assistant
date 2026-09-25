import { z } from "zod";

// Shared input fragments for tool schemas.
export const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
export const TimeHM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM (24h)");
export const DateTime = z
  .string()
  .refine((s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !Number.isNaN(Date.parse(s)), "expected ISO 8601 date-time with offset")
  .describe("ISO 8601 with timezone offset, e.g. 2026-09-27T08:30:00+03:00");
export const Uuid = z.string().uuid();

export const RecurrenceSchema = z.object({
  freq: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).max(365).default(1),
  byWeekday: z.array(z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)])).optional().describe("0=Sunday … 6=Saturday, weekly only"),
  until: DateKey.nullish(),
});
