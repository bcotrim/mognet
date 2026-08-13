import type {
  EnvironmentThread,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentId,
  OrchestrationCheckpointSummary,
  OrchestrationProposedPlan,
  ThreadId,
} from "@t3tools/contracts";
import {
  BotIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  FileDiffIcon,
  GitBranchIcon,
  LoaderCircleIcon,
  PlusIcon,
  TerminalIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatDuration } from "../session-logic";
import { useThread, useThreadShells } from "../state/entities";
import { cn } from "~/lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "./ui/collapsible";

export type PlanImplementationRunState =
  | "approval"
  | "input"
  | "working"
  | "monitoring"
  | "failed"
  | "interrupted"
  | "completed"
  | "ready";

type WorkflowStageState = "done" | "active" | "error" | "pending";

interface ActiveRunDiff {
  readonly files: number;
  readonly additions: number;
  readonly deletions: number;
}

interface PlanWorkflowProps {
  readonly activeThread: EnvironmentThread;
  readonly hasPullRequest: boolean;
  readonly addingRun: boolean;
  readonly onAddRun: (sourceThread: EnvironmentThread, plan: OrchestrationProposedPlan) => void;
  readonly onOpenThread: (environmentId: EnvironmentId, threadId: ThreadId) => void;
  readonly onOpenDiff?: (() => void) | undefined;
  readonly onOpenTerminal?: (() => void) | undefined;
  readonly onOpenPreview?: (() => void) | undefined;
  readonly onOpenAgents?: (() => void) | undefined;
  readonly onStop?: (() => void) | undefined;
}

export function collectPlanImplementationRuns(input: {
  readonly source: Pick<EnvironmentThreadShell, "environmentId" | "id" | "projectId">;
  readonly plan: Pick<OrchestrationProposedPlan, "id" | "implementationThreadId">;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
}): ReadonlyArray<EnvironmentThreadShell> {
  return input.threads
    .filter(
      (thread) =>
        thread.environmentId === input.source.environmentId &&
        thread.projectId === input.source.projectId &&
        (thread.id === input.plan.implementationThreadId ||
          (thread.origin?.type === "plan-implementation" &&
            thread.origin.sourceThreadId === input.source.id &&
            thread.origin.planId === input.plan.id)),
    )
    .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function resolvePlanImplementationRunState(
  run: Pick<
    EnvironmentThreadShell,
    "backgroundLiveness" | "hasPendingApprovals" | "hasPendingUserInput" | "latestTurn" | "session"
  >,
): PlanImplementationRunState {
  if (run.hasPendingApprovals) return "approval";
  if (run.hasPendingUserInput) return "input";
  if (run.session?.status === "running" || run.session?.status === "starting") return "working";
  if (run.session?.status === "error" || run.latestTurn?.state === "error") return "failed";
  if (run.backgroundLiveness === "working") return "working";
  if (run.backgroundLiveness === "monitoring") return "monitoring";
  if (run.latestTurn?.state === "interrupted") return "interrupted";
  if (run.latestTurn?.state === "completed") return "completed";
  return "ready";
}

export function deriveImplementationStageState(
  runs: ReadonlyArray<EnvironmentThreadShell>,
): WorkflowStageState {
  if (runs.length === 0) return "active";
  const states = runs.map(resolvePlanImplementationRunState);
  if (
    states.some((state) => ["approval", "input", "working", "monitoring", "ready"].includes(state))
  ) {
    return "active";
  }
  if (states.includes("completed")) return "done";
  return "error";
}

export function summarizeCheckpoint(
  checkpoint: OrchestrationCheckpointSummary | undefined,
): ActiveRunDiff | null {
  if (!checkpoint || checkpoint.status !== "ready") return null;
  return checkpoint.files.reduce<ActiveRunDiff>(
    (summary, file) => ({
      files: summary.files + 1,
      additions: summary.additions + file.additions,
      deletions: summary.deletions + file.deletions,
    }),
    { files: 0, additions: 0, deletions: 0 },
  );
}

const RUN_PRESENTATION: Record<
  PlanImplementationRunState,
  {
    readonly label: string;
    readonly dot: string;
    readonly badge: "error" | "info" | "success" | "warning" | "secondary";
  }
> = {
  approval: { label: "Approval needed", dot: "bg-warning", badge: "warning" },
  input: { label: "Awaiting input", dot: "bg-primary", badge: "warning" },
  working: { label: "Running", dot: "bg-info", badge: "info" },
  monitoring: { label: "Monitoring", dot: "bg-info", badge: "info" },
  failed: { label: "Failed", dot: "bg-destructive", badge: "error" },
  interrupted: { label: "Stopped", dot: "bg-muted-foreground", badge: "secondary" },
  completed: { label: "Completed", dot: "bg-success", badge: "success" },
  ready: { label: "Ready", dot: "bg-muted-foreground", badge: "secondary" },
};

function WorkflowStage({
  label,
  state,
}: {
  readonly label: string;
  readonly state: WorkflowStageState;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
        state === "done"
          ? "border-success/25 bg-success/6 text-success-foreground"
          : state === "active"
            ? "border-info/35 bg-info/6 text-info-foreground"
            : state === "error"
              ? "border-destructive/25 bg-destructive/6 text-destructive-foreground"
              : "border-border/50 text-muted-foreground/65",
      )}
    >
      {state === "done" ? (
        <CircleCheckIcon aria-hidden className="size-3.5" />
      ) : state === "active" ? (
        <CircleDashedIcon aria-hidden className="size-3.5" />
      ) : (
        <CircleDashedIcon aria-hidden className="size-3.5" />
      )}
      {label}
    </div>
  );
}

function RunElapsed({
  run,
  live,
}: {
  readonly run: EnvironmentThreadShell;
  readonly live: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [live]);

  const startedAt = run.latestTurn?.startedAt ?? run.latestTurn?.requestedAt;
  if (!startedAt) return null;
  const start = Date.parse(startedAt);
  const end = run.latestTurn?.completedAt ? Date.parse(run.latestTurn.completedAt) : now;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return <span>{formatDuration(end - start)}</span>;
}

function ImplementationRunCard({
  run,
  index,
  active,
  diff,
  onOpen,
  onOpenDiff,
  onOpenTerminal,
  onOpenPreview,
  onOpenAgents,
  onStop,
}: {
  readonly run: EnvironmentThreadShell;
  readonly index: number;
  readonly active: boolean;
  readonly diff: ActiveRunDiff | null;
  readonly onOpen: () => void;
  readonly onOpenDiff?: (() => void) | undefined;
  readonly onOpenTerminal?: (() => void) | undefined;
  readonly onOpenPreview?: (() => void) | undefined;
  readonly onOpenAgents?: (() => void) | undefined;
  readonly onStop?: (() => void) | undefined;
}) {
  const state = resolvePlanImplementationRunState(run);
  const presentation = RUN_PRESENTATION[state];
  const live = state === "working" || state === "monitoring";

  return (
    <article
      className={cn(
        "min-w-0 rounded-xl border bg-background/70 p-3",
        active ? "border-primary/35 ring-1 ring-primary/15" : "border-border/60",
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              presentation.dot,
              live && "animate-pulse",
            )}
          />
          <h3 className="truncate text-sm font-medium">Run {index + 1}</h3>
          {active ? <Badge variant="outline">Current</Badge> : null}
        </div>
        <Badge variant={presentation.badge}>{presentation.label}</Badge>
      </div>

      <div className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <BotIcon aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">{run.modelSelection.instanceId}</span>
        <span aria-hidden>/</span>
        <span className="truncate font-mono">{run.modelSelection.model}</span>
        <span aria-hidden>·</span>
        <RunElapsed run={run} live={live} />
      </div>

      {run.branch ? (
        <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <GitBranchIcon aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate font-mono">{run.branch}</span>
        </div>
      ) : null}

      {run.planProgress ? (
        <div className="mt-2">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="truncate">{run.planProgress.step}</span>
            <span className="shrink-0 tabular-nums">
              {run.planProgress.completedSteps}/{run.planProgress.totalSteps}
            </span>
          </div>
          <progress
            aria-label={`Run ${index + 1} plan progress`}
            className="mt-1 h-1 w-full accent-primary"
            max={Math.max(1, run.planProgress.totalSteps)}
            value={run.planProgress.completedSteps}
          />
        </div>
      ) : null}

      {active && diff ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <FileDiffIcon aria-hidden className="size-3.5" />
          <span>{diff.files} files</span>
          <span className="text-success-foreground">+{diff.additions}</span>
          <span className="text-destructive-foreground">−{diff.deletions}</span>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {!active ? (
          <Button size="xs" variant="outline" onClick={onOpen}>
            Open
          </Button>
        ) : (
          <>
            {onOpenDiff ? (
              <Button size="xs" variant="outline" onClick={onOpenDiff}>
                Diff
              </Button>
            ) : null}
            {onOpenTerminal ? (
              <Button size="xs" variant="outline" onClick={onOpenTerminal}>
                <TerminalIcon aria-hidden />
                Terminal
              </Button>
            ) : null}
            {onOpenPreview ? (
              <Button size="xs" variant="outline" onClick={onOpenPreview}>
                Preview
              </Button>
            ) : null}
            {onOpenAgents ? (
              <Button size="xs" variant="outline" onClick={onOpenAgents}>
                Agents
              </Button>
            ) : null}
            {onStop && state === "working" ? (
              <Button size="xs" variant="destructive-outline" onClick={onStop}>
                Stop
              </Button>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}

export function PlanWorkflow({
  activeThread,
  hasPullRequest,
  addingRun,
  onAddRun,
  onOpenThread,
  onOpenDiff,
  onOpenTerminal,
  onOpenPreview,
  onOpenAgents,
  onStop,
}: PlanWorkflowProps) {
  const origin = activeThread.origin?.type === "plan-implementation" ? activeThread.origin : null;
  const sourceRef = useMemo(
    () => (origin ? scopeThreadRef(activeThread.environmentId, origin.sourceThreadId) : null),
    [activeThread.environmentId, origin?.sourceThreadId],
  );
  const linkedSourceThread = useThread(sourceRef);
  const sourceThread = origin ? linkedSourceThread : activeThread;
  const plan = useMemo(() => {
    if (!sourceThread) return null;
    const planId = origin?.planId ?? sourceThread.proposedPlans.at(-1)?.id;
    return sourceThread.proposedPlans.find((candidate) => candidate.id === planId) ?? null;
  }, [origin?.planId, sourceThread]);
  const allThreadShells = useThreadShells();
  const runs = useMemo(
    () =>
      sourceThread && plan
        ? collectPlanImplementationRuns({ source: sourceThread, plan, threads: allThreadShells })
        : [],
    [allThreadShells, plan, sourceThread],
  );

  if (!sourceThread || !plan) return null;

  const implementationState = deriveImplementationStageState(runs);
  const activeIsRun = runs.some((run) => run.id === activeThread.id);
  const activeRunDiff = activeIsRun ? summarizeCheckpoint(activeThread.checkpoints.at(-1)) : null;
  const openThread = (threadId: ThreadId) => onOpenThread(sourceThread.environmentId, threadId);

  return (
    <Collapsible defaultOpen className="border-b border-border/60 bg-muted/15">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-3 py-2 sm:px-4">
        <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronRightIcon
            aria-hidden
            className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-90"
          />
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto pb-0.5">
            <WorkflowStage label="Plan" state="done" />
            <ChevronRightIcon aria-hidden className="size-3 shrink-0 text-muted-foreground/40" />
            <WorkflowStage
              label={`Implementation${runs.length > 0 ? ` (${runs.length})` : ""}`}
              state={implementationState}
            />
            <ChevronRightIcon aria-hidden className="size-3 shrink-0 text-muted-foreground/40" />
            <WorkflowStage label="Validation" state="pending" />
            <ChevronRightIcon aria-hidden className="size-3 shrink-0 text-muted-foreground/40" />
            <WorkflowStage label="Review" state="pending" />
            <ChevronRightIcon aria-hidden className="size-3 shrink-0 text-muted-foreground/40" />
            <WorkflowStage label="PR" state={activeIsRun && hasPullRequest ? "done" : "pending"} />
          </div>
        </CollapsibleTrigger>
        {activeThread.id === sourceThread.id ? (
          <Button
            size="xs"
            variant="outline"
            disabled={addingRun}
            onClick={() => onAddRun(sourceThread, plan)}
          >
            {addingRun ? (
              <LoaderCircleIcon aria-hidden className="animate-spin" />
            ) : (
              <PlusIcon aria-hidden />
            )}
            Add run
          </Button>
        ) : (
          <Button size="xs" variant="outline" onClick={() => openThread(sourceThread.id)}>
            Plan
          </Button>
        )}
      </div>

      <CollapsiblePanel>
        <div className="mx-auto w-full max-w-3xl px-3 pb-3 sm:px-4">
          {runs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-sm text-muted-foreground">
              Plan ready. Start an implementation run to begin.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {runs.map((run, index) => {
                const active = run.id === activeThread.id;
                return (
                  <ImplementationRunCard
                    key={run.id}
                    run={run}
                    index={index}
                    active={active}
                    diff={active ? activeRunDiff : null}
                    onOpen={() => openThread(run.id)}
                    {...(active && onOpenDiff ? { onOpenDiff } : {})}
                    {...(active && onOpenTerminal ? { onOpenTerminal } : {})}
                    {...(active && onOpenPreview ? { onOpenPreview } : {})}
                    {...(active && onOpenAgents ? { onOpenAgents } : {})}
                    {...(active && onStop ? { onStop } : {})}
                  />
                );
              })}
            </div>
          )}
          {runs.length > 1 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Compare model, status, progress, and branch here; open a run for its full diff.
            </p>
          ) : !activeIsRun && runs.length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Open a run to inspect its live diff, terminal, preview, and agents.
            </p>
          ) : null}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}
