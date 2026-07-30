// @effect-diagnostics nodeBuiltinImport:off - Spies on native removal to verify its postcondition.
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  DEFAULT_PROJECT_NEW_WORKTREES_START_FROM_ORIGIN,
  DEFAULT_PROJECT_TEXT_GENERATION_MODEL_SELECTION,
  DEFAULT_PROJECT_THREAD_ENV_MODE,
  type OrchestrationProjectShell,
  type OrchestrationThreadShell,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { assert, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as NodeFS from "node:fs";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as TerminalManager from "../terminal/Manager.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import {
  removeWorktreeNodeDependencies,
  sweepArchivedWorktreeDependencies,
} from "./WorktreeDependencyMaintenance.ts";

const projectId = ProjectId.make("project-dependency-maintenance");
const modelSelection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "gpt-5-codex",
} as const;

const makeThread = (
  id: string,
  worktreePath: string,
  archivedAt: string | null = "1960-01-01T00:00:00.000Z",
): OrchestrationThreadShell => ({
  id: ThreadId.make(id),
  projectId,
  title: id,
  modelSelection,
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: id,
  worktreePath,
  latestTurn: null,
  createdAt: "1960-01-01T00:00:00.000Z",
  updatedAt: "1960-01-01T00:00:00.000Z",
  archivedAt,
  settledOverride: null,
  settledAt: null,
  session: null,
  latestUserMessageAt: null,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  hasActionableProposedPlan: false,
});

const makeProject = (workspaceRoot: string): OrchestrationProjectShell => ({
  id: projectId,
  kind: "workspace",
  title: "Dependency maintenance",
  workspaceRoot,
  defaultModelSelection: modelSelection,
  defaultThreadEnvMode: DEFAULT_PROJECT_THREAD_ENV_MODE,
  newWorktreesStartFromOrigin: DEFAULT_PROJECT_NEW_WORKTREES_START_FROM_ORIGIN,
  textGenerationModelSelection: DEFAULT_PROJECT_TEXT_GENERATION_MODEL_SELECTION,
  scripts: [
    {
      id: "setup",
      name: "Setup",
      command: "vp install",
      icon: "configure",
      runOnWorktreeCreate: true,
    },
  ],
  createdAt: "1960-01-01T00:00:00.000Z",
  updatedAt: "1960-01-01T00:00:00.000Z",
});

it.effect("prunes only inactive ignored node_modules from archived worktrees", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "mognet-dependency-maintenance-",
      });
      const workspaceRoot = path.join(root, "project");
      const eligiblePath = path.join(root, "eligible");
      const activePath = path.join(root, "active");
      const terminalPath = path.join(root, "terminal");
      const unignoredPath = path.join(root, "unignored");
      yield* fileSystem.makeDirectory(workspaceRoot);

      for (const worktreePath of [eligiblePath, activePath, terminalPath, unignoredPath]) {
        yield* fileSystem.makeDirectory(path.join(worktreePath, "node_modules"), {
          recursive: true,
        });
        yield* fileSystem.writeFileString(path.join(worktreePath, "package.json"), "{}");
      }
      const electronResourcesPath = path.join(
        eligiblePath,
        "node_modules",
        "electron",
        "dist",
        "Electron.app",
        "Contents",
        "Resources",
      );
      yield* fileSystem.makeDirectory(electronResourcesPath, { recursive: true });
      yield* fileSystem.writeFileString(path.join(electronResourcesPath, "default_app.asar"), "{}");
      const canonicalUnignoredPath = yield* fileSystem.realPath(unignoredPath);

      const project = makeProject(workspaceRoot);
      const archivedThreads = [
        makeThread("eligible", eligiblePath),
        makeThread("active-archive", activePath),
        makeThread("terminal", terminalPath),
        makeThread("unignored", unignoredPath),
      ];

      const cleanedCount = yield* sweepArchivedWorktreeDependencies.pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.mock(ProjectionSnapshotQuery.ProjectionSnapshotQuery)({
              getArchivedShellSnapshot: () =>
                Effect.succeed({
                  snapshotSequence: 1,
                  projects: [project],
                  threads: archivedThreads,
                  updatedAt: "1960-01-01T00:00:00.000Z",
                }),
              getShellSnapshot: () =>
                Effect.succeed({
                  snapshotSequence: 1,
                  projects: [project],
                  threads: [makeThread("active", activePath, null)],
                  updatedAt: "1960-01-01T00:00:00.000Z",
                }),
              getThreadShellById: () => Effect.succeed(Option.none()),
            }),
            Layer.mock(TerminalManager.TerminalManager)({
              hasRunningSession: (threadId) =>
                Effect.succeed(threadId === ThreadId.make("terminal")),
            }),
            Layer.mock(GitVcsDriver.GitVcsDriver)({
              execute: ({ cwd }) =>
                Effect.succeed({
                  exitCode: ChildProcessSpawner.ExitCode(cwd === canonicalUnignoredPath ? 1 : 0),
                  stdout: "",
                  stderr: "",
                  stdoutTruncated: false,
                  stderrTruncated: false,
                }),
            }),
          ),
        ),
      );

      assert.equal(cleanedCount, 1);
      assert.isFalse(yield* fileSystem.exists(path.join(eligiblePath, "node_modules")));
      assert.isTrue(yield* fileSystem.exists(path.join(activePath, "node_modules")));
      assert.isTrue(yield* fileSystem.exists(path.join(terminalPath, "node_modules")));
      assert.isTrue(yield* fileSystem.exists(path.join(unignoredPath, "node_modules")));
    }),
  ).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("removes only clean archived worktrees beyond the retained 15", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "mognet-worktree-retention-",
      });
      const workspaceRoot = path.join(root, "project");
      yield* fileSystem.makeDirectory(workspaceRoot);
      const canonicalWorkspaceRoot = yield* fileSystem.realPath(workspaceRoot);

      const worktreePaths: string[] = [];
      for (let index = 0; index < 27; index += 1) {
        const worktreePath = path.join(root, `worktree-${index}`);
        yield* fileSystem.makeDirectory(worktreePath);
        worktreePaths.push(yield* fileSystem.realPath(worktreePath));
      }
      const archivedThreads = worktreePaths.map((worktreePath, index) =>
        makeThread(
          `thread-${index}`,
          worktreePath,
          `1960-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
        ),
      );
      const removeWorktree = vi.fn(
        (_: Parameters<GitVcsDriver.GitVcsDriver["Service"]["removeWorktree"]>[0]) => Effect.void,
      );

      const cleanedCount = yield* sweepArchivedWorktreeDependencies.pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.mock(ProjectionSnapshotQuery.ProjectionSnapshotQuery)({
              getArchivedShellSnapshot: () =>
                Effect.succeed({
                  snapshotSequence: 1,
                  projects: [makeProject(workspaceRoot)],
                  threads: archivedThreads,
                  updatedAt: "1960-01-28T00:00:00.000Z",
                }),
              getShellSnapshot: () =>
                Effect.succeed({
                  snapshotSequence: 1,
                  projects: [],
                  threads: [],
                  updatedAt: "1960-01-28T00:00:00.000Z",
                }),
              getThreadShellById: () => Effect.succeed(Option.none()),
            }),
            Layer.mock(TerminalManager.TerminalManager)({
              hasRunningSession: () => Effect.succeed(false),
            }),
            Layer.mock(GitVcsDriver.GitVcsDriver)({
              execute: ({ operation, cwd }) =>
                Effect.succeed({
                  exitCode: ChildProcessSpawner.ExitCode(0),
                  stdout:
                    operation === "WorktreeDependencyMaintenance.checkStatus"
                      ? cwd === worktreePaths[0]
                        ? "!! .env\0"
                        : "!! apps/web/node_modules/\0!! .vite-hooks/_/pre-commit\0"
                      : "",
                  stderr: "",
                  stdoutTruncated: false,
                  stderrTruncated: false,
                }),
              removeWorktree,
            }),
          ),
        ),
      );

      assert.equal(cleanedCount, 10);
      assert.deepEqual(
        removeWorktree.mock.calls.map(([input]) => input),
        worktreePaths.slice(1, 11).map((worktreePath) => ({
          cwd: canonicalWorkspaceRoot,
          path: worktreePath,
        })),
      );
    }),
  ).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("fails when node_modules remains after removal", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "mognet-dependency-removal-",
      });
      const nodeModulesPath = path.join(root, "node_modules");
      yield* fileSystem.makeDirectory(nodeModulesPath);

      const remove = vi.spyOn(NodeFS.promises, "rm").mockResolvedValue(undefined);
      const error = yield* removeWorktreeNodeDependencies(nodeModulesPath).pipe(
        Effect.flip,
        Effect.ensuring(Effect.sync(() => remove.mockRestore())),
      );

      assert.match(error.message, /still exist/);
    }),
  ).pipe(Effect.provide(NodeServices.layer)),
);
