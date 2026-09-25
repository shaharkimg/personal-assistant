import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export const qk = {
  home: ["home"] as const,
  tasks: ["tasks"] as const,
  task: (id: string) => ["task", id] as const,
  waiting: ["waiting"] as const,
  inbox: ["inbox"] as const,
  projects: ["projects"] as const,
  project: (id: string) => ["project", id] as const,
  documents: ["documents"] as const,
  document: (id: string) => ["document", id] as const,
  activity: ["activity"] as const,
  memories: ["memories"] as const,
  profile: ["profile"] as const,
  conversations: ["conversations"] as const,
};

/** After the assistant (or the user) changes data, refresh every view and re-plan notifications. */
export function invalidateAll() {
  void queryClient.invalidateQueries();
  // Lazy import avoids a require cycle (planner -> data -> queries).
  void import("@/services/notifications/sync").then((m) => m.scheduleNotificationSync());
}
