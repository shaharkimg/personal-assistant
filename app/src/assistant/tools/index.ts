import { ToolRegistry } from "../registry";
import type { ToolSpec } from "../types";
import { taskTools } from "./tasks";
import { waitingTools } from "./waiting";
import { calendarTools } from "./calendar";
import { contactTools } from "./contacts";
import { documentTools } from "./documents";
import { briefTools } from "./briefs";
import { projectTools } from "./projects";
import { memoryTools } from "./memory";
import { inboxTools } from "./inbox";

// Deterministic order keeps the tool block byte-stable for prompt caching.
export const allTools: ToolSpec[] = [
  ...taskTools,
  ...waitingTools,
  ...calendarTools,
  ...contactTools,
  ...documentTools,
  ...briefTools,
  ...projectTools,
  ...memoryTools,
  ...inboxTools,
] as ToolSpec[];

export const toolRegistry = new ToolRegistry(allTools);
