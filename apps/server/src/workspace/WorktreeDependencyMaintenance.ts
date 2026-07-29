import { setupProjectScript } from "@t3tools/shared/projectScripts";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schedule from "effect/Schedule";

import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as TerminalManager from "../terminal/Manager.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";

const ARCHIVE_GRACE_MS = Duration.toMillis(Duration.days(7));
const SWEEP_INTERVAL = Duration.hours(24);

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

  let cleanedCount = 0;
  for (const [worktreePath, threads] of threadsByWorktreePath) {
    const cleaned = yield* Effect.gen(function* () {
      if (
        path.dirname(worktreePath) === worktreePath ||
        activeWorktreePaths.has(worktreePath) ||
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
      for (const project of projects) {
        if (
          project !== undefined &&
          canonicalWorktreePath ===
            (yield* fileSystem.realPath(path.resolve(project.workspaceRoot)))
        ) {
          return false;
        }
      }

      const dependencyState = yield* inspectWorktreeNodeDependencies(canonicalWorktreePath);
      if (!dependencyState.hasPackageManifest || !dependencyState.hasNodeModules) {
        return false;
      }

      const ignored = yield* git.execute({
        operation: "WorktreeDependencyMaintenance.checkIgnored",
        cwd: canonicalWorktreePath,
        args: ["check-ignore", "-q", "--", "node_modules"],
        allowNonZeroExit: true,
        timeoutMs: 20_000,
        maxOutputBytes: 1_024,
      });
      if (ignored.exitCode !== 0) {
        return false;
      }

      const becameActive = (yield* Effect.forEach(threads, (thread) =>
        projectionSnapshotQuery.getThreadShellById(thread.id),
      )).some(Option.isSome);
      const hasRunningTerminal = (yield* Effect.forEach(threads, (thread) =>
        terminalManager.hasRunningSession(thread.id),
      )).some(Boolean);
      if (becameActive || hasRunningTerminal) {
        return false;
      }

      yield* fileSystem.remove(path.join(canonicalWorktreePath, "node_modules"), {
        recursive: true,
        force: true,
      });
      yield* Effect.logInfo("archived worktree dependencies pruned", {
        worktreePath: canonicalWorktreePath,
        threadIds: threads.map((thread) => thread.id),
      });
      return true;
    }).pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : Effect.logWarning("archived worktree dependency cleanup skipped", {
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
          : Effect.logWarning("archived worktree dependency sweep failed", {
              cause: Cause.pretty(cause),
            }),
      ),
      Effect.repeat(Schedule.spaced(SWEEP_INTERVAL)),
    ),
  );
  yield* Effect.logInfo("archived worktree dependency maintenance started", {
    archiveGraceMs: ARCHIVE_GRACE_MS,
    sweepIntervalMs: Duration.toMillis(SWEEP_INTERVAL),
  });
});
