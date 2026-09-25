import { describe, expect, it } from "vitest";
import { nextOccurrence, describeRecurrence } from "@/domain/recurrence";
import { findAvailableSlots, findConflicts, freeIntervals, gapBeforeNextEvent } from "@/domain/availability";
import { buildDailyBrief, buildEveningReview, buildSuggestions, dailyBriefToText, eveningReviewToText, homeSummary } from "@/domain/brief";
import { deferOutOfQuietHours, isQuietTime, planNotifications } from "@/domain/proactive";
import { detectSensitive, isValidIsraeliId } from "@/domain/sensitive";
import { greeting, toLocalISO } from "@/domain/dates";
import { heuristicClassify } from "@/domain/inbox";
import { at, event, task, waiting } from "./fixtures";

describe("recurrence", () => {
  it("daily / interval", () => {
    expect(nextOccurrence({ freq: "daily", interval: 1 }, "2026-09-25")).toBe("2026-09-26");
    expect(nextOccurrence({ freq: "daily", interval: 3 }, "2026-09-30")).toBe("2026-10-03");
  });
  it("weekly with weekdays", () => {
    // 2026-09-23 is a Wednesday. Rule: Sunday + Wednesday.
    expect(nextOccurrence({ freq: "weekly", interval: 1, byWeekday: [0, 3] }, "2026-09-23")).toBe("2026-09-27");
    expect(nextOccurrence({ freq: "weekly", interval: 1, byWeekday: [0, 3] }, "2026-09-27")).toBe("2026-09-30");
    expect(nextOccurrence({ freq: "weekly", interval: 2 }, "2026-09-23")).toBe("2026-10-07");
  });
  it("monthly clamps to month end, keeps anchor day", () => {
    expect(nextOccurrence({ freq: "monthly", interval: 1 }, "2026-01-31")).toBe("2026-02-28");
    expect(nextOccurrence({ freq: "monthly", interval: 1 }, "2026-02-28", "2026-01-31")).toBe("2026-03-31");
  });
  it("respects until", () => {
    expect(nextOccurrence({ freq: "daily", interval: 1, until: "2026-09-25" }, "2026-09-25")).toBeNull();
  });
  it("describes in Hebrew", () => {
    expect(describeRecurrence({ freq: "weekly", interval: 1, byWeekday: [0] })).toBe("כל שבוע (א׳)");
  });
});

describe("availability", () => {
  const day = at(2026, 9, 28); // Monday
  const events = [
    event("A", at(2026, 9, 28, 13, 0), at(2026, 9, 28, 14, 0)),
    event("B", at(2026, 9, 28, 15, 0), at(2026, 9, 28, 16, 30)),
    event("free", at(2026, 9, 28, 16, 30), at(2026, 9, 28, 18, 0), { busy: false }),
  ];

  it("computes free intervals", () => {
    const free = freeIntervals(events, at(2026, 9, 28, 12), at(2026, 9, 28, 18));
    expect(free.map((f) => [f.start.getHours(), f.end.getHours()])).toEqual([[12, 13], [14, 15], [16, 18]]);
  });

  it("finds afternoon one-hour slots avoiding meetings", () => {
    const slots = findAvailableSlots(events, {
      rangeStart: day,
      rangeEnd: at(2026, 9, 28, 23, 59),
      durationMinutes: 60,
      partOfDay: "afternoon",
      now: at(2026, 9, 25),
    });
    expect(slots.map((s) => s.start.getHours() * 60 + s.start.getMinutes())).toEqual([14 * 60, 16 * 60 + 30]);
    for (const s of slots) expect(findConflicts(events, s.start, s.end)).toHaveLength(0);
  });

  it("skips Saturday and past times", () => {
    const slots = findAvailableSlots([], {
      rangeStart: at(2026, 9, 26), // Saturday
      rangeEnd: at(2026, 9, 27, 23),
      durationMinutes: 30,
      now: at(2026, 9, 27, 10, 10),
    });
    expect(slots[0].start).toEqual(at(2026, 9, 27, 10, 30));
  });

  it("detects conflicts", () => {
    expect(findConflicts(events, at(2026, 9, 28, 13, 30), at(2026, 9, 28, 14, 30)).map((e) => e.title)).toEqual(["A"]);
  });

  it("gap before next event", () => {
    const g = gapBeforeNextEvent(events, at(2026, 9, 28, 14, 35));
    expect(g?.minutes).toBe(25);
    expect(gapBeforeNextEvent(events, at(2026, 9, 28, 13, 30))).toBeNull();
  });
});

describe("brief", () => {
  const now = at(2026, 9, 25, 8, 0);
  const tasks = [
    task({ title: "לשלוח הסכם", status: "today", priority: "high" }),
    task({ title: "באיחור", dueDate: "2026-09-23" }),
    task({ title: "הושלמה", status: "completed", completedAt: at(2026, 9, 25, 7, 30).toISOString() }),
    task({ title: "בעתיד", dueDate: "2026-10-10", status: "upcoming" }),
  ];
  const events = [
    event("פגישה X", at(2026, 9, 25, 9), at(2026, 9, 25, 10)),
    event("פגישה Y", at(2026, 9, 25, 12, 30), at(2026, 9, 25, 13, 30)),
    event("מחר", at(2026, 9, 26, 9, 30), at(2026, 9, 26, 10)),
  ];
  const wf = [waiting({ expectedResponseDate: "2026-09-24" }), waiting({ person: "רועי", expectedResponseDate: "2026-10-01" })];

  it("home summary counts only real items", () => {
    expect(homeSummary({ now, tasks, waiting: wf, events })).toBe(
      "יש לך היום 2 פגישות, 2 משימות פתוחות ודבר אחד שממתין לתשובה.",
    );
    expect(homeSummary({ now, tasks: [], waiting: [], events: [] })).toContain("פנוי");
  });

  it("daily brief lists events, tasks and waiting with refs", () => {
    const b = buildDailyBrief({ now, tasks, waiting: wf, events }, "בוקר טוב");
    expect(b.events.map((e) => e.time)).toEqual(["09:00", "12:30"]);
    expect(b.importantTasks[0].text).toBe("לשלוח הסכם");
    expect(b.waiting).toHaveLength(2);
    expect(b.attention.some((a) => a.text.includes("באיחור"))).toBe(true);
    const text = dailyBriefToText(b);
    expect(text).toContain("09:00 – פגישה X");
    expect(text).toContain("ממתינים לתשובה:");
  });

  it("evening review", () => {
    const r = buildEveningReview({ now: at(2026, 9, 25, 20), tasks, waiting: wf, events });
    expect(r.completed).toBe(1);
    expect(r.planned).toBe(3);
    const text = eveningReviewToText(r);
    expect(text).toContain("היום השלמת 1 מתוך 3 משימות.");
    expect(text).toContain("מחר הפגישה הראשונה שלך ב-09:30.");
  });

  it("suggestions include follow-up for overdue waiting", () => {
    const s = buildSuggestions({ now, tasks, waiting: wf, events });
    const fu = s.find((x) => x.kind === "follow_up");
    expect(fu?.body).toBe('דני עדיין מסומן כממתין לתשובה על "ההסכם". רוצה שאכין הודעת follow-up?');
    expect(s.some((x) => x.kind === "overdue")).toBe(true);
  });
});

describe("proactive planner", () => {
  const settings = { proactivity: "balanced" as const, quietHoursStart: "22:00", quietHoursEnd: "07:30", morningBriefTime: "08:00", eveningReviewTime: "20:30" };

  it("quiet hours across midnight", () => {
    expect(isQuietTime(at(2026, 9, 25, 23), "22:00", "07:30")).toBe(true);
    expect(isQuietTime(at(2026, 9, 25, 7, 45), "22:00", "07:30")).toBe(false);
    expect(deferOutOfQuietHours(at(2026, 9, 25, 23), "22:00", "07:30")).toEqual(at(2026, 9, 26, 7, 30));
  });

  it("plans meeting alerts 30 min before and respects level", () => {
    const now = at(2026, 9, 25, 8);
    const events = [event("סטטוס", at(2026, 9, 25, 11), at(2026, 9, 25, 12))];
    const plan = planNotifications({ now, tasks: [], waiting: [], events, settings });
    const mtg = plan.find((p) => p.kind === "meeting");
    expect(mtg?.at).toEqual(at(2026, 9, 25, 10, 30));
    const off = planNotifications({ now, tasks: [], waiting: [], events, settings: { ...settings, proactivity: "off" } });
    expect(off).toHaveLength(0);
  });

  it("explicit reminders always fire, even when proactivity is off", () => {
    const now = at(2026, 9, 25, 8);
    const t = task({ title: "להתקשר ליוסי", remindAt: at(2026, 9, 27, 8, 30).toISOString() });
    const plan = planNotifications({ now, tasks: [t], waiting: [], events: [], settings: { ...settings, proactivity: "off" } }, 72);
    expect(plan).toHaveLength(1);
    expect(plan[0].body).toBe("להתקשר ליוסי");
  });

  it("waiting-for nudge text", () => {
    const now = at(2026, 9, 25, 12);
    const w = waiting({ expectedResponseDate: "2026-09-24", createdAt: at(2026, 9, 22, 12).toISOString() });
    const plan = planNotifications({ now, tasks: [], waiting: [w], events: [], settings });
    expect(plan.find((p) => p.kind === "waiting")?.body).toBe("עברו 3 ימים ועדיין לא סימנת שקיבלת תשובה מדני. להכין הודעת follow-up?");
  });
});

describe("sensitive data", () => {
  it("validates Israeli IDs", () => {
    expect(isValidIsraeliId("000000018")).toBe(true);
    expect(isValidIsraeliId("123456789")).toBe(false);
  });
  it("detects sensitive content", () => {
    expect(detectSensitive("הכרטיס שלי 4580 1234 5678 9014")).toEqual([]);
    expect(detectSensitive("כרטיס 4111 1111 1111 1111")).toContain("credit_card");
    expect(detectSensitive("הסיסמה לוויפי היא 1234")).toContain("password");
    expect(detectSensitive("התחלתי טיפול תרופתי")).toContain("health");
    expect(detectSensitive("אני אוהב פגישות בבוקר")).toEqual([]);
  });
});

describe("misc", () => {
  it("greets by time of day", () => {
    expect(greeting("שחר", at(2026, 9, 25, 8))).toBe("בוקר טוב, שחר");
    expect(greeting("שחר", at(2026, 9, 25, 19))).toBe("ערב טוב, שחר");
  });
  it("local ISO includes offset", () => {
    expect(toLocalISO(at(2026, 9, 25, 9, 5))).toMatch(/^2026-09-25T09:05:00[+-]\d\d:\d\d$/);
  });
  it("heuristic inbox classification", () => {
    expect(heuristicClassify("מחר להתקשר לעירייה", "text").type).toBe("task");
    expect(heuristicClassify("https://example.com/article", "text").type).toBe("reference");
    expect(heuristicClassify("שלחתי לדני את ההסכם", "text").type).toBe("waiting_for");
  });
});
