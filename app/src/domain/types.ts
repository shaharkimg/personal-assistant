// Domain model shared by the data layer, the tool layer and the UI.

export const TASK_STATUSES = ["inbox", "today", "upcoming", "waiting", "someday", "completed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_SOURCES = ["manual", "assistant", "voice", "inbox", "share", "camera", "recurrence", "quick_capture"] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export interface Recurrence {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  /** For weekly rules: which weekdays (0=Sunday). */
  byWeekday?: Weekday[];
  /** Inclusive end date YYYY-MM-DD. */
  until?: string | null;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: string;
  updatedAt: string;
  /** YYYY-MM-DD (local) */
  dueDate: string | null;
  /** HH:MM (local) */
  dueTime: string | null;
  remindAt: string | null;
  completedAt: string | null;
  projectId: string | null;
  tags: string[];
  source: TaskSource;
  relatedPerson: string | null;
  relatedPersonId: string | null;
  followUpDate: string | null;
  recurrence: Recurrence | null;
  recurrenceParentId: string | null;
  estimatedMinutes: number | null;
  rolledOverCount: number;
}

export type WaitingStatus = "open" | "received" | "cancelled";

export interface WaitingFor {
  id: string;
  person: string;
  personId: string | null;
  subject: string;
  createdAt: string;
  expectedResponseDate: string | null;
  status: WaitingStatus;
  relatedTaskId: string | null;
  projectId: string | null;
  notes: string | null;
  lastNudgedAt: string | null;
  resolvedAt: string | null;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  status: "active" | "archived";
  deadline: string | null;
  createdAt: string;
}

export interface Note {
  id: string;
  title: string | null;
  body: string;
  kind: "note" | "idea" | "reference" | "link";
  url: string | null;
  projectId: string | null;
  tags: string[];
  source: string;
  createdAt: string;
}

export interface Person {
  id: string;
  displayName: string;
  contactRef: string | null;
  notes: string | null;
}

export type DocumentStatus = "uploaded" | "processing" | "ready" | "failed";

export interface DocumentRecord {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  storagePath: string;
  extraStoragePaths: string[];
  source: "upload" | "camera" | "scan" | "share" | "chat";
  projectId: string | null;
  status: DocumentStatus;
  error: string | null;
  charCount: number | null;
  chunkCount: number | null;
  createdAt: string;
}

export const INBOX_TYPES = ["task", "note", "document", "reminder", "event", "waiting_for", "reference"] as const;
export type InboxType = (typeof INBOX_TYPES)[number];

export interface InboxSuggestion {
  title?: string;
  dueDate?: string | null;
  dueTime?: string | null;
  person?: string | null;
  expectedResponseDate?: string | null;
  start?: string | null;
  durationMinutes?: number | null;
  summary?: string | null;
}

export interface InboxItem {
  id: string;
  kind: "text" | "voice" | "file" | "image" | "link";
  rawText: string | null;
  url: string | null;
  documentId: string | null;
  suggestedType: InboxType | null;
  suggestion: InboxSuggestion | null;
  confidence: number | null;
  finalType: InboxType | null;
  status: "new" | "processed" | "archived";
  processedRefType: string | null;
  processedRefId: string | null;
  createdAt: string;
}

export type MemoryCategory = "preference" | "fact" | "routine" | "relationship" | "work";

export interface Memory {
  id: string;
  category: MemoryCategory;
  content: string;
  source: "user_explicit" | "user_approved";
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ActivityEntry {
  id: number;
  occurredAt: string;
  actor: "assistant" | "user" | "system";
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  metadata: Record<string, unknown>;
}

export type Proactivity = "off" | "low" | "balanced" | "high";

export interface Profile {
  id: string;
  displayName: string | null;
  timezone: string;
  locale: string;
  proactivity: Proactivity;
  quietHoursStart: string;
  quietHoursEnd: string;
  morningBriefTime: string | null;
  eveningReviewTime: string | null;
  workingHoursStart: string;
  workingHoursEnd: string;
}

/** A calendar event normalized across providers (device, Google, Outlook). */
export interface CalendarEvent {
  id: string;
  provider: "device" | "google" | "outlook";
  calendarId: string;
  calendarTitle?: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  /** Free events (availability = free) don't block time. */
  busy: boolean;
}

export interface TimeSlot {
  start: Date;
  end: Date;
}
