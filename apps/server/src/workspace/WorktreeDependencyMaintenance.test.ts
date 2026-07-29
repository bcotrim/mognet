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
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as TerminalManager from "../terminal/Manager.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import { sweepArchivedWorktreeDependencies } from "./WorktreeDependencyMaintenance.ts";

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
      const canonicalUnignoredPath = yield* fileSystem.realPath(unignoredPath);

      const project: OrchestrationProjectShell = {
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
      };
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
