// @effect-diagnostics nodeBuiltinImport:off - Electron's original-fs avoids patched .asar traversal.
import { setupProjectScript } from "@t3tools/shared/projectScripts";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";

import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as TerminalManager from "../terminal/Manager.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";

const ARCHIVE_GRACE_MS = Duration.toMillis(Duration.days(7));
const RETAINED_ARCHIVED_WORKTREE_COUNT = 15;
const MAX_WORKTREE_REMOVALS_PER_SWEEP = 10;
const SWEEP_INTERVAL = Duration.hours(24);

// Electron patches node:fs to traverse .asar files, which breaks recursive removal.
const nativeFileSystem =
  "electron" in process.versions
    ? (NodeModule.createRequire(import.meta.url)("original-fs") as typeof NodeFS)
    : NodeFS;

export class WorktreeDependencyRemovalError extends Schema.TaggedErrorClass<WorktreeDependencyRemovalError>()(
  "WorktreeDependencyRemovalError",
  {
    nodeModulesPath: Schema.String,
    reason: Schema.Literals(["remove-failed", "still-exists"]),
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return this.reason === "still-exists"
      ? `Worktree dependencies still exist at '${this.nodeModulesPath}' after removal.`
      : `Failed to remove worktree dependencies at '${this.nodeModulesPath}'.`;
  }
}

export const inspectWorktreeNodeDependencies = Effect.fn("WorktreeDependencyMaintenance.inspect")(
  function* (worktreePath: string) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const [hasPackageManifest, hasNodeModules] = yield* Effect.all([
      fileSystem.exists(path.join(worktreePath, "package.json")),
      fileSystem.exists(path.join(worktreePath, "node_modules")),
    ]);
    return { hasPackageManifest, hasNodeModules };
  },
);

export const removeWorktreeNodeDependencies = Effect.fn("WorktreeDependencyMaintenance.remove")(
  function* (nodeModulesPath: string) {
    const fileSystem = yield* FileSystem.FileSystem;
    yield* Effect.tryPromise({
      try: () =>
        nativeFileSystem.promises.rm(nodeModulesPath, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        }),
      catch: (cause) =>
        new WorktreeDependencyRemovalError({
          nodeModulesPath,
          reason: "remove-failed",
          cause,
        }),
    });
    if (yield* fileSystem.exists(nodeModulesPath)) {
      return yield* new WorktreeDependencyRemovalError({
        nodeModulesPath,
        reason: "still-exists",
      });
    }
  },
);

function latestArchiveTime(threads: ReadonlyArray<{ readonly archivedAt: string | null }>): number {
  const archiveTimes = threads
    .map((thread) => (thread.archivedAt === null ? Number.NaN : Date.parse(thread.archivedAt)))
    .filter(Number.isFinite);
  return archiveTimes.length === 0 ? Number.NEGATIVE_INFINITY : Math.max(...archiveTimes);
}

function hasProtectedWorktreeState(status: string): boolean {
  return status.split("\0").some((entry) => {
    if (entry.length === 0) return false;
    if (!entry.startsWith("!! ")) return true;

    const ignoredPath = entry.slice(3);
    return (
      ignoredPath !== "node_modules/" &&
      !ignoredPath.includes("/node_modules/") &&
      !ignoredPath.startsWith(".vite-hooks/_/")
    );
  });
}

export const sweepArchivedWorktreeDependencies = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const projectionSnapshotQuery = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;
  const terminalManager = yield* TerminalManager.TerminalManager;
  const git = yield* GitVcsDriver.GitVcsDriver;
  const now = yield* Clock.currentTimeMillis;
  const [archivedSnapshot, activeSnapshot] = yield* Effect.all([
    projectionSnapshotQuery.getArchivedShellSnapshot(),
    projectionSnapshotQuery.getShellSnapshot(),
  ]);

  const canonicalizeRecordedPath = (recordedPath: string) => {
    const resolvedPath = path.resolve(recordedPath);
    return fileSystem.realPath(resolvedPath).pipe(Effect.orElseSucceed(() => resolvedPath));
  };

  const activeWorktreePaths = new Set(
    yield* Effect.forEach(
      activeSnapshot.threads.flatMap((thread) =>
        thread.worktreePath === null ? [] : [thread.worktreePath],
      ),
      canonicalizeRecordedPath,
    ),
  );
  const projectsById = new Map(
    archivedSnapshot.projects.map((project) => [project.id, project] as const),
  );
  const threadsByWorktreePath = new Map<string, (typeof archivedSnapshot.threads)[number][]>();

  for (const thread of archivedSnapshot.threads) {
    if (thread.worktreePath === null) continue;
    const worktreePath = yield* canonicalizeRecordedPath(thread.worktreePath);
    const threads = threadsByWorktreePath.get(worktreePath) ?? [];
    threads.push(thread);
    threadsByWorktreePath.set(worktreePath, threads);
  }

  const worktreesByRecency = [...threadsByWorktreePath].toSorted(
    ([leftPath, leftThreads], [rightPath, rightThreads]) =>
      latestArchiveTime(rightThreads) - latestArchiveTime(leftThreads) ||
      leftPath.localeCompare(rightPath),
  );
  const retainedWorktreePaths = new Set(
    worktreesByRecency
      .slice(0, RETAINED_ARCHIVED_WORKTREE_COUNT)
      .map(([worktreePath]) => worktreePath),
  );

  let cleanedCount = 0;
  let removedWorktreeCount = 0;
  for (const [worktreePath, threads] of worktreesByRecency.toReversed()) {
    const cleaned = yield* Effect.gen(function* () {
      if (
        path.dirname(worktreePath) === worktreePath ||
        activeWorktreePaths.has(worktreePath) ||
        !(yield* fileSystem.exists(worktreePath)) ||
        threads.some((thread) => {
          const archivedAt =
            thread.archivedAt === null ? Number.NaN : Date.parse(thread.archivedAt);
          return (
            !Number.isFinite(archivedAt) ||
            now - archivedAt < ARCHIVE_GRACE_MS ||
            thread.latestTurn?.state === "running" ||
            (thread.session !== null && thread.session.status !== "stopped")
          );
        })
      ) {
        return false;
      }

      const projects = threads.map((thread) => projectsById.get(thread.projectId));
      if (
        projects.some(
          (project) =>
            project === undefined ||
            project.kind !== "workspace" ||
            setupProjectScript(project.scripts) === null,
        )
      ) {
        return false;
      }

      const canonicalWorktreePath = yield* fileSystem.realPath(worktreePath);
      const workspaceRoots = new Set<string>();
      for (const project of projects) {
        if (project === undefined) return false;
        const workspaceRoot = yield* fileSystem.realPath(path.resolve(project.workspaceRoot));
        workspaceRoots.add(workspaceRoot);
        if (canonicalWorktreePath === workspaceRoot) {
          return false;
        }
      }
      if (workspaceRoots.size !== 1) return false;

      const dependencyState = yield* inspectWorktreeNodeDependencies(canonicalWorktreePath);
      let didClean = false;
      if (dependencyState.hasPackageManifest && dependencyState.hasNodeModules) {
        const ignored = yield* git.execute({
          operation: "WorktreeDependencyMaintenance.checkIgnored",
          cwd: canonicalWorktreePath,
          args: ["check-ignore", "-q", "--", "node_modules"],
          allowNonZeroExit: true,
          timeoutMs: 20_000,
          maxOutputBytes: 1_024,
        });
        if (ignored.exitCode === 0) {
          const becameActive = (yield* Effect.forEach(threads, (thread) =>
            projectionSnapshotQuery.getThreadShellById(thread.id),
          )).some(Option.isSome);
          const hasRunningTerminal = (yield* Effect.forEach(threads, (thread) =>
            terminalManager.hasRunningSession(thread.id),
          )).some(Boolean);
          if (becameActive || hasRunningTerminal) return false;

          yield* removeWorktreeNodeDependencies(path.join(canonicalWorktreePath, "node_modules"));
          yield* Effect.logInfo("archived worktree dependencies pruned", {
            worktreePath: canonicalWorktreePath,
            threadIds: threads.map((thread) => thread.id),
          });
          didClean = true;
        }
      }

      if (
        retainedWorktreePaths.has(worktreePath) ||
        removedWorktreeCount >= MAX_WORKTREE_REMOVALS_PER_SWEEP
      ) {
        return didClean;
      }

      const branch = threads[0]?.branch;
      if (!branch || threads.some((thread) => thread.branch !== branch)) return didClean;

      const workspaceRoot = [...workspaceRoots][0];
      if (!workspaceRoot) return didClean;
      const branchExists = yield* git.execute({
        operation: "WorktreeDependencyMaintenance.checkBranch",
        cwd: workspaceRoot,
        args: ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
        allowNonZeroExit: true,
        timeoutMs: 20_000,
        maxOutputBytes: 1_024,
      });
      if (branchExists.exitCode !== 0) return didClean;

      const status = yield* git.execute({
        operation: "WorktreeDependencyMaintenance.checkStatus",
        cwd: canonicalWorktreePath,
        args: ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored=matching"],
        allowNonZeroExit: true,
        timeoutMs: 20_000,
        maxOutputBytes: 64 * 1_024,
      });
      if (
        status.exitCode !== 0 ||
        status.stdoutTruncated ||
        status.stderrTruncated ||
        hasProtectedWorktreeState(status.stdout)
      ) {
        yield* Effect.logInfo("archived worktree retained due to local state", {
          worktreePath: canonicalWorktreePath,
          threadIds: threads.map((thread) => thread.id),
        });
        return didClean;
      }

      const becameActive = (yield* Effect.forEach(threads, (thread) =>
        projectionSnapshotQuery.getThreadShellById(thread.id),
      )).some(Option.isSome);
      const hasRunningTerminal = (yield* Effect.forEach(threads, (thread) =>
        terminalManager.hasRunningSession(thread.id),
      )).some(Boolean);
      if (becameActive || hasRunningTerminal) return didClean;

      yield* git.removeWorktree({
        cwd: workspaceRoot,
        path: canonicalWorktreePath,
      });
      removedWorktreeCount += 1;
      yield* Effect.logInfo("archived worktree removed", {
        worktreePath: canonicalWorktreePath,
        threadIds: threads.map((thread) => thread.id),
      });
      return true;
    }).pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : Effect.logWarning("archived worktree maintenance skipped", {
              worktreePath,
              cause: Cause.pretty(cause),
            }).pipe(Effect.as(false)),
      ),
    );

    if (cleaned) cleanedCount += 1;
  }

  return cleanedCount;
});

export const startArchivedWorktreeDependencyMaintenance = Effect.gen(function* () {
  yield* Effect.forkScoped(
    sweepArchivedWorktreeDependencies.pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : Effect.logWarning("archived worktree maintenance sweep failed", {
              cause: Cause.pretty(cause),
            }),
      ),
      Effect.repeat(Schedule.spaced(SWEEP_INTERVAL)),
    ),
  );
  yield* Effect.logInfo("archived worktree maintenance started", {
    archiveGraceMs: ARCHIVE_GRACE_MS,
    retainedArchivedWorktreeCount: RETAINED_ARCHIVED_WORKTREE_COUNT,
    maxWorktreeRemovalsPerSweep: MAX_WORKTREE_REMOVALS_PER_SWEEP,
    sweepIntervalMs: Duration.toMillis(SWEEP_INTERVAL),
  });
});
