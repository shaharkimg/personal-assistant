import { z } from "zod";
import { defineTool } from "../types";
import { loadBriefInput } from "@/services/briefData";
import { buildDailyBrief, buildEveningReview, buildSuggestions, dailyBriefToText, eveningReviewToText, overdueTasks, overdueWaiting } from "@/domain/brief";
import { greeting } from "@/domain/dates";
import { getProfile } from "@/data/profile";

export const briefTools = [
  defineTool({
    name: "getDailyBrief",
    label: "מכין תקציר יומי",
    doneLabel: "הוכן תקציר",
    description:
      "Build today's brief from real data (calendar, tasks, waiting-for). Use for 'what's my day', 'what do I need to do today', 'summarize my day'. " +
      "Present its content faithfully — do not add items that aren't in it.",
    schema: z.object({}),
    risk: "safe",
    async run(_i, ctx) {
      const [input, profile] = await Promise.all([loadBriefInput(ctx.now), getProfile()]);
      const brief = buildDailyBrief(input, greeting(profile?.displayName, ctx.now));
      return { calendarConnected: input.calendarConnected, text: dailyBriefToText(brief), brief };
    },
  }),

  defineTool({
    name: "getEveningReview",
    label: "מסכם את היום",
    doneLabel: "הוכן סיכום",
    description: "End-of-day review: tasks completed vs planned, what carries over, open waiting-for items, tomorrow's first meeting.",
    schema: z.object({}),
    risk: "safe",
    async run(_i, ctx) {
      const input = await loadBriefInput(ctx.now);
      const review = buildEveningReview(input);
      return { text: eveningReviewToText(review), review };
    },
  }),

  defineTool({
    name: "getOpenLoops",
    label: "בודק מה נשכח",
    doneLabel: "נבדקו פריטים פתוחים",
    description:
      "Things that may have slipped: overdue tasks, overdue waiting-for items, follow-up dates reached, unsorted inbox items, repeatedly postponed tasks. " +
      "Use for 'did I forget anything important?'.",
    schema: z.object({}),
    risk: "safe",
    async run(_i, ctx) {
      const input = await loadBriefInput(ctx.now);
      return {
        overdueTasks: overdueTasks(input.tasks, ctx.now).map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate })),
        overdueWaiting: overdueWaiting(input.waiting, ctx.now).map((w) => ({ id: w.id, person: w.person, subject: w.subject, expected: w.expectedResponseDate })),
        suggestions: buildSuggestions(input).map((s) => ({ title: s.title, body: s.body })),
        unsortedInbox: (input.inbox ?? []).length,
      };
    },
  }),
];
