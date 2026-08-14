import type {
  OrchestrationThreadOrigin,
  ScheduledTaskSnapshot,
  ThreadId,
} from "@t3tools/contracts";

export type ScheduledThreadOrigin = Extract<OrchestrationThreadOrigin, { type: "scheduled-task" }>;

export function resolveScheduledThreadOrigin(input: {
  readonly thread:
    | {
        readonly id: ThreadId;
        readonly origin?: OrchestrationThreadOrigin;
      }
    | null
    | undefined;
  readonly scheduledTasks: ReadonlyArray<ScheduledTaskSnapshot>;
}): ScheduledThreadOrigin | null {
  const thread = input.thread;
  if (!thread) return null;
  if (thread.origin?.type === "scheduled-task") return thread.origin;

  const task = input.scheduledTasks.find(
    (candidate) =>
      candidate.lastThreadId === thread.id ||
      candidate.runThreadIds.some((threadId) => threadId === thread.id),
  );
  if (!task) return null;

  return {
    type: "scheduled-task",
    scheduledTaskId: task.id,
    scheduledTaskTitle: task.title,
  };
}
