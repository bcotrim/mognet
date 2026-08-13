import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  CheckpointRef,
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  collectPlanImplementationRuns,
  deriveImplementationStageState,
  resolvePlanImplementationRunState,
  summarizeCheckpoint,
} from "./PlanWorkflow";

const environmentId = EnvironmentId.make("local");
const projectId = ProjectId.make("project-1");
const sourceThreadId = ThreadId.make("source");

function makeThread(
  id: string,
  overrides: Partial<EnvironmentThreadShell> = {},
): EnvironmentThreadShell {
  return {
    environmentId,
    id: ThreadId.make(id),
    projectId,
    title: id,
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: "main",
    worktreePath: null,
    latestTurn: null,
    createdAt: `2026-08-13T10:00:0${id.length}.000Z`,
    updatedAt: "2026-08-13T10:00:00.000Z",
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    session: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    ...overrides,
  };
}

describe("PlanWorkflow", () => {
  it("groups plan runs and derives their live workflow state", () => {
    const firstRun = makeThread("run-1", {
      createdAt: "2026-08-13T10:00:01.000Z",
      latestTurn: {
        turnId: TurnId.make("turn-1"),
        state: "completed",
        requestedAt: "2026-08-13T10:00:00.000Z",
        startedAt: "2026-08-13T10:00:01.000Z",
        completedAt: "2026-08-13T10:01:00.000Z",
        assistantMessageId: null,
      },
    });
    const secondRun = makeThread("run-2", {
      createdAt: "2026-08-13T10:00:02.000Z",
      origin: { type: "plan-implementation", sourceThreadId, planId: "plan-1" },
      session: {
        threadId: ThreadId.make("run-2"),
        status: "running",
        providerName: "Codex",
        runtimeMode: "full-access",
        activeTurnId: TurnId.make("turn-2"),
        lastError: null,
        updatedAt: "2026-08-13T10:02:00.000Z",
      },
    });
    const unrelated = makeThread("run-3", {
      origin: { type: "plan-implementation", sourceThreadId, planId: "another-plan" },
    });

    const runs = collectPlanImplementationRuns({
      source: makeThread("source"),
      plan: { id: "plan-1", implementationThreadId: firstRun.id },
      threads: [unrelated, secondRun, firstRun],
    });

    expect(runs.map((run) => run.id)).toEqual([firstRun.id, secondRun.id]);
    expect(resolvePlanImplementationRunState(secondRun)).toBe("working");
    expect(deriveImplementationStageState(runs)).toBe("active");
    expect(
      summarizeCheckpoint({
        turnId: TurnId.make("turn-2"),
        checkpointTurnCount: 1,
        checkpointRef: CheckpointRef.make("checkpoint-1"),
        status: "ready",
        files: [
          { path: "src/a.ts", kind: "modified", additions: 5, deletions: 2 },
          { path: "src/b.ts", kind: "added", additions: 3, deletions: 0 },
        ],
        assistantMessageId: null,
        completedAt: "2026-08-13T10:03:00.000Z",
      }),
    ).toEqual({ files: 2, additions: 8, deletions: 2 });
  });
});
