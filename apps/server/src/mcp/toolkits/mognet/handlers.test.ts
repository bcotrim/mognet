import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it, vi } from "@effect/vitest";
import {
  DEFAULT_PROJECT_NEW_WORKTREES_START_FROM_ORIGIN,
  DEFAULT_PROJECT_TEXT_GENERATION_MODEL_SELECTION,
  DEFAULT_PROJECT_THREAD_ENV_MODE,
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  STANDALONE_CHAT_PROJECT_ID,
  ScheduledTaskId,
  ThreadId,
  type TerminalOpenInput,
  type TerminalSessionSnapshot,
  type TerminalWriteInput,
  type ModelSelection,
  type OrchestrationCommand,
  type OrchestrationProjectShell,
  type OrchestrationThread,
  type OrchestrationThreadShell,
  type ScheduledTaskSnapshot,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { McpSchema, McpServer } from "effect/unstable/ai";

import * as ServerConfig from "../../../config.ts";
import * as ScheduledTasks from "../../../scheduledTasks.ts";
import * as OrchestrationEngine from "../../../orchestration/Services/OrchestrationEngine.ts";
import * as ProjectionSnapshotQuery from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as ThreadTurnBootstrapDispatcher from "../../../orchestration/ThreadTurnBootstrapDispatcher.ts";
import * as TerminalManager from "../../../terminal/Manager.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { MognetToolkitHandlersLive } from "./handlers.ts";
import { MognetToolkit } from "./tools.ts";

const environmentId = EnvironmentId.make("environment-mognet-tools");
const projectId = ProjectId.make("project-mognet-tools");
const threadId = ThreadId.make("thread-mognet-tools");
const now = "2026-07-02T12:00:00.000Z";
const modelSelection: ModelSelection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "gpt-5",
};
const PROJECT_DEFAULTS = {
  defaultThreadEnvMode: DEFAULT_PROJECT_THREAD_ENV_MODE,
  newWorktreesStartFromOrigin: DEFAULT_PROJECT_NEW_WORKTREES_START_FROM_ORIGIN,
  textGenerationModelSelection: DEFAULT_PROJECT_TEXT_GENERATION_MODEL_SELECTION,
} as const;

const project: OrchestrationProjectShell = {
  id: projectId,
  kind: "workspace",
  title: "Mognet Tools",
  workspaceRoot: "/tmp/mognet-tools",
  repositoryIdentity: null,
  defaultModelSelection: modelSelection,
  ...PROJECT_DEFAULTS,
  scripts: [],
  createdAt: now,
  updatedAt: now,
};

const testAction = {
  id: "test",
  name: "Test",
  command: "vp test",
  icon: "test",
  runOnWorktreeCreate: false,
} as const;

const setupAction = {
  id: "setup",
  name: "Setup",
  command: "pnpm install",
  icon: "configure",
  runOnWorktreeCreate: true,
} as const;

const projectWithActions: OrchestrationProjectShell = {
  ...project,
  scripts: [setupAction, testAction],
};

const threadShell: OrchestrationThreadShell = {
  id: threadId,
  projectId,
  title: "Current thread",
  modelSelection,
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: "main",
  worktreePath: "/tmp/mognet-tools",
  latestTurn: null,
  createdAt: now,
  updatedAt: now,
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  session: null,
  latestUserMessageAt: now,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  hasActionableProposedPlan: false,
};

const thread: OrchestrationThread = {
  ...threadShell,
  deletedAt: null,
  messages: [
    {
      id: "message-1" as never,
      role: "user",
      text: "Please build workflow tools.",
      attachments: [],
      turnId: null,
      streaming: false,
      createdAt: now,
      updatedAt: now,
    },
  ],
  proposedPlans: [],
  activities: [],
  checkpoints: [],
};

const standaloneThreadId = ThreadId.make("thread-mognet-standalone");

const standaloneProject: OrchestrationProjectShell = {
  id: STANDALONE_CHAT_PROJECT_ID,
  kind: "standalone",
  title: "Chat",
  workspaceRoot: "/tmp/mognet-chat",
  repositoryIdentity: null,
  defaultModelSelection: modelSelection,
  ...PROJECT_DEFAULTS,
  scripts: [],
  createdAt: now,
  updatedAt: now,
};

const standaloneThreadShell: OrchestrationThreadShell = {
  id: standaloneThreadId,
  projectId: STANDALONE_CHAT_PROJECT_ID,
  title: "Standalone chat",
  modelSelection,
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  latestTurn: null,
  createdAt: now,
  updatedAt: now,
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  session: null,
  latestUserMessageAt: now,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  hasActionableProposedPlan: false,
};

const standaloneThread: OrchestrationThread = {
  ...standaloneThreadShell,
  deletedAt: null,
  messages: [
    {
      id: "message-standalone-1" as never,
      role: "user",
      text: "What threads are in this chat?",
      attachments: [],
      turnId: null,
      streaming: false,
      createdAt: now,
      updatedAt: now,
    },
  ],
  proposedPlans: [],
  activities: [],
  checkpoints: [],
};

const invocation = {
  environmentId,
  threadId,
  providerSessionId: "provider-session-mognet-tools",
  providerInstanceId: ProviderInstanceId.make("codex"),
  capabilities: new Set(["preview", "orchestration", "scheduled-tasks"] as const),
  issuedAt: 1,
  expiresAt: Number.MAX_SAFE_INTEGER,
};

const standaloneInvocation = {
  ...invocation,
  threadId: standaloneThreadId,
  providerSessionId: "provider-session-mognet-standalone",
};

const client = McpSchema.McpServerClient.of({
  clientId: 1,
  initializePayload: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "mognet-tools-test", version: "1.0.0" },
  },
  getClient: Effect.die("unused"),
});

function testLayer(
  capturedCommands: OrchestrationCommand[],
  options?: {
    readonly projects?: ReadonlyArray<OrchestrationProjectShell>;
    readonly threadShells?: ReadonlyArray<OrchestrationThreadShell>;
    readonly threads?: ReadonlyArray<OrchestrationThread>;
    readonly invocation?: typeof invocation;
    readonly terminalManager?: Partial<TerminalManager.TerminalManager["Service"]>;
  },
) {
  const projects = options?.projects ?? [project];
  const threadShells = options?.threadShells ?? [threadShell];
  const threads = options?.threads ?? [thread];
  const layerInvocation = options?.invocation ?? invocation;
  const query = ProjectionSnapshotQuery.ProjectionSnapshotQuery.of({
    getCommandReadModel: () => Effect.die("unused"),
    getSnapshot: () => Effect.die("unused"),
    getShellSnapshot: () =>
      Effect.succeed({
        snapshotSequence: 1,
        projects,
        threads: threadShells,
        updatedAt: now,
      }),
    getArchivedShellSnapshot: () =>
      Effect.succeed({
        snapshotSequence: 1,
        projects: [],
        threads: [],
        updatedAt: now,
      }),
    getSnapshotSequence: () => Effect.succeed({ snapshotSequence: 1 }),
    getCounts: () => Effect.succeed({ projectCount: projects.length, threadCount: threads.length }),
    getActiveProjectByWorkspaceRoot: (workspaceRoot) => {
      const activeProject = projects.find((project) => project.workspaceRoot === workspaceRoot);
      return Effect.succeed(
        activeProject === undefined
          ? Option.none()
          : Option.some({ ...activeProject, deletedAt: null }),
      );
    },
    getProjectShellById: (id) => {
      const matchingProject = projects.find((project) => project.id === id);
      return Effect.succeed(
        matchingProject === undefined ? Option.none() : Option.some(matchingProject),
      );
    },
    getFirstActiveThreadIdByProjectId: (id) => {
      const matchingThread = threadShells.find((thread) => thread.projectId === id);
      return Effect.succeed(
        matchingThread === undefined ? Option.none() : Option.some(matchingThread.id),
      );
    },
    getThreadCheckpointContext: () => Effect.succeed(Option.none()),
    getFullThreadDiffContext: () => Effect.succeed(Option.none()),
    getThreadShellById: (id) => {
      const matchingThread = threadShells.find((thread) => thread.id === id);
      return Effect.succeed(
        matchingThread === undefined ? Option.none() : Option.some(matchingThread),
      );
    },
    getThreadDetailById: (id) => {
      const matchingThread = threads.find((thread) => thread.id === id);
      return Effect.succeed(
        matchingThread === undefined ? Option.none() : Option.some(matchingThread),
      );
    },
    getThreadDetailSnapshot: (id) => {
      const matchingThread = threads.find((thread) => thread.id === id);
      return Effect.succeed(
        matchingThread === undefined
          ? Option.none()
          : Option.some({ snapshotSequence: 1, thread: matchingThread }),
      );
    },
  });
  const engine = OrchestrationEngine.OrchestrationEngineService.of({
    readEvents: () => Stream.empty,
    latestSequence: Effect.succeed(0),
    dispatch: (command) =>
      Effect.sync(() => {
        capturedCommands.push(command);
        return { sequence: capturedCommands.length };
      }),
    streamDomainEvents: Stream.empty,
  });
  const dispatcher = ThreadTurnBootstrapDispatcher.ThreadTurnBootstrapDispatcher.of({
    dispatch: (command) =>
      Effect.sync(() => {
        capturedCommands.push(command);
        return { sequence: 10 };
      }),
  });
  const scheduledTasks = ScheduledTasks.ScheduledTasks.of({
    list: Effect.succeed({ tasks: [] }),
    create: (input) => {
      const task = {
        ...input,
        id: ScheduledTaskId.make("task-1"),
        createdAt: now,
        updatedAt: now,
        lastStartedAt: null,
        lastFinishedAt: null,
        lastStatus: null,
        lastError: null,
        lastThreadId: null,
        runThreadIds: [],
        runState: "pending_manual_run",
        nextRunAt: null,
      } as ScheduledTaskSnapshot;
      return Effect.succeed({ task, tasks: [task] });
    },
    update: () => Effect.die("unused"),
    delete: () => Effect.die("unused"),
    runNow: () => Effect.die("unused"),
    runDueTasks: Effect.void,
    start: Effect.void,
    streamChanges: Stream.empty,
  });
  const terminalManager = TerminalManager.TerminalManager.of({
    open: () => Effect.die("unused"),
    attachStream: () => Effect.die("unused"),
    write: () => Effect.die("unused"),
    resize: () => Effect.die("unused"),
    clear: () => Effect.die("unused"),
    restart: () => Effect.die("unused"),
    close: () => Effect.die("unused"),
    subscribe: () => Effect.succeed(() => undefined),
    subscribeMetadata: () => Effect.succeed(() => undefined),
    ...options?.terminalManager,
  });

  return McpServer.toolkit(MognetToolkit).pipe(
    Layer.provide(MognetToolkitHandlersLive),
    Layer.provideMerge(McpServer.McpServer.layer),
    Layer.provide(
      Layer.succeed(
        McpInvocationContext.McpInvocationContext,
        McpInvocationContext.McpInvocationContext.of(layerInvocation),
      ),
    ),
    Layer.provide(Layer.succeed(ProjectionSnapshotQuery.ProjectionSnapshotQuery, query)),
    Layer.provide(Layer.succeed(OrchestrationEngine.OrchestrationEngineService, engine)),
    Layer.provide(
      Layer.succeed(ThreadTurnBootstrapDispatcher.ThreadTurnBootstrapDispatcher, dispatcher),
    ),
    Layer.provide(Layer.succeed(ScheduledTasks.ScheduledTasks, scheduledTasks)),
    Layer.provide(Layer.succeed(TerminalManager.TerminalManager, terminalManager)),
    Layer.provide(
      Layer.succeed(
        ServerConfig.ServerConfig,
        ServerConfig.ServerConfig.of({
          chatWorkspaceDir: "/tmp/mognet-chat",
        } as ServerConfig.ServerConfig["Service"]),
      ),
    ),
    Layer.provide(NodeServices.layer),
  );
}

it.effect("reads project context and starts a bootstrapped thread", () =>
  Effect.gen(function* () {
    const commands: OrchestrationCommand[] = [];
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const server = yield* McpServer.McpServer;

        const context = yield* server
          .callTool({ name: "mognet_project_context", arguments: {} })
          .pipe(Effect.provideService(McpSchema.McpServerClient, client));
        expect(context.isError).toBe(false);
        expect(context.structuredContent).toMatchObject({
          currentThreadId: threadId,
          currentProject: { id: projectId },
          currentScope: {
            kind: "workspace-project",
            containerId: projectId,
            branch: "main",
          },
        });

        const started = yield* server
          .callTool({
            name: "mognet_thread_start",
            arguments: { title: "New task", prompt: "Run the new task." },
          })
          .pipe(Effect.provideService(McpSchema.McpServerClient, client));
        expect(started.isError).toBe(false);
        expect(started.structuredContent).toMatchObject({
          projectId,
          scope: { kind: "workspace-project", containerId: projectId, branch: "main" },
          sequence: 10,
          route: { environmentId },
        });
        expect(commands).toHaveLength(1);
        expect(commands[0]?.type).toBe("thread.turn.start");
        expect(commands[0]).toMatchObject({
          titleSeed: "New task",
          message: { text: "Run the new task." },
        });
      }),
    ).pipe(Effect.provide(testLayer(commands)));
  }),
);

it.effect("lists and creates project actions", () =>
  Effect.gen(function* () {
    const commands: OrchestrationCommand[] = [];
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const server = yield* McpServer.McpServer;

        const list = yield* server
          .callTool({ name: "mognet_project_actions_list", arguments: {} })
          .pipe(Effect.provideService(McpSchema.McpServerClient, client));
        expect(list.isError).toBe(false);
        expect(list.structuredContent).toMatchObject({
          projectId,
          scope: { kind: "workspace-project", containerId: projectId },
          actions: [],
        });

        const created = yield* server
          .callTool({
            name: "mognet_project_actions_create",
            arguments: {
              name: "Run Tests",
              command: "vp test",
              icon: "test",
              runOnWorktreeCreate: true,
            },
          })
          .pipe(Effect.provideService(McpSchema.McpServerClient, client));
        expect(created.isError).toBe(false);
        expect(created.structuredContent).toMatchObject({
          projectId,
          action: {
            id: "run-tests",
            name: "Run Tests",
            command: "vp test",
            icon: "test",
            runOnWorktreeCreate: true,
          },
          actions: [
            {
              id: "run-tests",
              runOnWorktreeCreate: true,
            },
          ],
          sequence: 1,
        });
        expect(commands).toHaveLength(1);
        expect(commands[0]).toMatchObject({
          type: "project.meta.update",
          projectId,
          scripts: [
            {
              id: "run-tests",
              name: "Run Tests",
              command: "vp test",
              icon: "test",
              runOnWorktreeCreate: true,
            },
          ],
        });
      }),
    ).pipe(Effect.provide(testLayer(commands)));
  }),
);

it.effect("updates and deletes project actions through project meta updates", () =>
  Effect.gen(function* () {
    const commands: OrchestrationCommand[] = [];
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const server = yield* McpServer.McpServer;

        const updated = yield* server
          .callTool({
            name: "mognet_project_actions_update",
            arguments: {
              actionId: "test",
              command: "vp run test",
              runOnWorktreeCreate: true,
            },
          })
          .pipe(Effect.provideService(McpSchema.McpServerClient, client));
        expect(updated.isError).toBe(false);
        expect(updated.structuredContent).toMatchObject({
          action: {
            id: "test",
            command: "vp run test",
            runOnWorktreeCreate: true,
          },
          actions: [
            { id: "setup", runOnWorktreeCreate: false },
            { id: "test", runOnWorktreeCreate: true },
          ],
        });

        const deleted = yield* server
          .callTool({
            name: "mognet_project_actions_delete",
            arguments: { actionId: "setup" },
          })
          .pipe(Effect.provideService(McpSchema.McpServerClient, client));
        expect(deleted.isError).toBe(false);
        expect(deleted.structuredContent).toMatchObject({
          action: null,
          actions: [{ id: "test" }],
          sequence: 2,
        });
        expect(commands).toHaveLength(2);
        expect(commands[0]).toMatchObject({
          type: "project.meta.update",
          scripts: [
            { id: "setup", runOnWorktreeCreate: false },
            { id: "test", command: "vp run test", runOnWorktreeCreate: true },
          ],
        });
        expect(commands[1]).toMatchObject({
          type: "project.meta.update",
          scripts: [{ id: "test" }],
        });
      }),
    ).pipe(
      Effect.provide(
        testLayer(commands, {
          projects: [projectWithActions],
          threadShells: [threadShell],
          threads: [thread],
        }),
      ),
    );
  }),
);

it.effect("runs a project action in a fresh terminal", () =>
  Effect.gen(function* () {
    const commands: OrchestrationCommand[] = [];
    const open = vi.fn((input: TerminalOpenInput) =>
      Effect.succeed({
        threadId: input.threadId,
        terminalId: input.terminalId,
        cwd: input.cwd,
        worktreePath: input.worktreePath ?? null,
        status: "running",
        pid: 123,
        history: "",
        exitCode: null,
        exitSignal: null,
        label: input.terminalId,
        updatedAt: now,
      } satisfies TerminalSessionSnapshot),
    );
    const write = vi.fn((_input: TerminalWriteInput) => Effect.void);

    return yield* Effect.scoped(
      Effect.gen(function* () {
        const server = yield* McpServer.McpServer;

        const run = yield* server
          .callTool({
            name: "mognet_project_actions_run",
            arguments: { actionId: "test" },
          })
          .pipe(Effect.provideService(McpSchema.McpServerClient, client));
        expect(run.isError).toBe(false);
        expect(run.structuredContent).toMatchObject({
          projectId,
          action: testAction,
          threadId,
          cwd: "/tmp/mognet-tools",
          worktreePath: "/tmp/mognet-tools",
          terminal: {
            status: "running",
          },
        });
        expect(run.structuredContent?.terminalId).toMatch(/^action-test-/);
        expect(open).toHaveBeenCalledWith({
          threadId,
          terminalId: expect.stringMatching(/^action-test-/),
          cwd: "/tmp/mognet-tools",
          worktreePath: "/tmp/mognet-tools",
          env: {
            MOGNET_PROJECT_ROOT: "/tmp/mognet-tools",
            MOGNET_WORKTREE_PATH: "/tmp/mognet-tools",
          },
        });
        expect(write).toHaveBeenCalledWith({
          threadId,
          terminalId: expect.stringMatching(/^action-test-/),
          data: "vp test\r",
        });
        expect(commands).toHaveLength(0);
      }),
    ).pipe(
      Effect.provide(
        testLayer(commands, {
          projects: [projectWithActions],
          threadShells: [threadShell],
          threads: [thread],
          terminalManager: { open, write },
        }),
      ),
    );
  }),
);

it.effect("reports standalone chat as a chat scope", () =>
  Effect.gen(function* () {
    const commands: OrchestrationCommand[] = [];
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const server = yield* McpServer.McpServer;

        const context = yield* server
          .callTool({ name: "mognet_project_context", arguments: {} })
          .pipe(Effect.provideService(McpSchema.McpServerClient, client));
        expect(context.isError).toBe(false);
        expect(context.structuredContent).toMatchObject({
          currentThreadId: standaloneThreadId,
          presentation: {
            scopeKind: "standalone-chat",
            exposeInternalContainerId: false,
            exposeWorkspacePath: false,
            exposeBranch: false,
            exposeThreadCounts: false,
            exposeRoute: false,
          },
          currentProject: null,
          currentScope: {
            kind: "standalone-chat",
            containerId: null,
            workspaceRoot: null,
            branch: null,
            repositoryApplicable: false,
            scriptsApplicable: false,
          },
          currentThreadSummary: {
            threadId: standaloneThreadId,
            title: "Standalone chat",
          },
          currentThread: null,
          hasOtherScopeThreads: false,
          projects: [],
          scopeThreads: [],
          projectThreads: [],
        });
        expect(context.structuredContent?.currentScope?.presentation).toContain(
          "internal project IDs",
        );
        expect(context.structuredContent?.presentation?.responseGuidance).toContain(
          "no workspace project or Git branch is attached",
        );

        const list = yield* server
          .callTool({ name: "mognet_threads_list", arguments: {} })
          .pipe(Effect.provideService(McpSchema.McpServerClient, client));
        expect(list.isError).toBe(false);
        expect(list.structuredContent).toMatchObject({
          currentThreadId: standaloneThreadId,
          scope: { kind: "standalone-chat", containerId: null, workspaceRoot: null },
          presentation: { exposeThreadCounts: false },
          threadSummaries: [{ threadId: standaloneThreadId, title: "Standalone chat" }],
          projects: [],
          threads: [],
        });

        const status = yield* server
          .callTool({ name: "mognet_thread_status", arguments: {} })
          .pipe(Effect.provideService(McpSchema.McpServerClient, client));
        expect(status.isError).toBe(false);
        expect(status.structuredContent).toMatchObject({
          scope: { kind: "standalone-chat", containerId: null, workspaceRoot: null },
          presentation: { exposeInternalContainerId: false },
          threadSummary: { threadId: standaloneThreadId, title: "Standalone chat" },
          thread: null,
        });

        const open = yield* server
          .callTool({ name: "mognet_thread_open", arguments: {} })
          .pipe(Effect.provideService(McpSchema.McpServerClient, client));
        expect(open.isError).toBe(false);
        expect(open.structuredContent).toMatchObject({
          scope: { kind: "standalone-chat", containerId: null, workspaceRoot: null },
          presentation: { exposeRoute: false },
          threadSummary: { threadId: standaloneThreadId, title: "Standalone chat" },
          thread: null,
        });

        const delegated = yield* server
          .callTool({
            name: "mognet_delegate_task",
            arguments: { prompt: "Summarize this chat." },
          })
          .pipe(Effect.provideService(McpSchema.McpServerClient, client));
        expect(delegated.isError).toBe(false);
        expect(delegated.structuredContent).toMatchObject({
          projectId: null,
          scope: {
            kind: "standalone-chat",
            containerId: null,
            workspaceRoot: null,
            branch: null,
          },
          presentation: { exposeInternalContainerId: false },
        });
        expect(commands).toHaveLength(1);
        expect(commands[0]?.type).toBe("thread.turn.start");
        expect(commands[0]).toMatchObject({
          titleSeed: "Delegate: Standalone chat",
          bootstrap: {
            createThread: {
              projectId: STANDALONE_CHAT_PROJECT_ID,
              branch: null,
              worktreePath: null,
            },
          },
        });
        const text = commands[0]?.type === "thread.turn.start" ? commands[0].message.text : "";
        expect(text).toContain("Scope: standalone chat");
        expect(text).toContain("Workspace project: not attached");
        expect(text).toContain("Branch: not applicable");
        expect(text).not.toContain("/tmp/mognet-chat");
        expect(text).not.toContain("Project:");
      }),
    ).pipe(
      Effect.provide(
        testLayer(commands, {
          projects: [standaloneProject],
          threadShells: [standaloneThreadShell],
          threads: [standaloneThread],
          invocation: standaloneInvocation,
        }),
      ),
    );
  }),
);

it.effect("delegates with source context in local workspace mode", () =>
  Effect.gen(function* () {
    const commands: OrchestrationCommand[] = [];
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const server = yield* McpServer.McpServer;

        const delegated = yield* server
          .callTool({
            name: "mognet_delegate_task",
            arguments: {
              prompt: "Inspect the local workspace.",
              workspaceMode: "local",
            },
          })
          .pipe(Effect.provideService(McpSchema.McpServerClient, client));

        expect(delegated.isError).toBe(false);
        expect(delegated.structuredContent).toMatchObject({
          projectId,
          sequence: 10,
          route: { environmentId },
        });
        expect(commands).toHaveLength(1);
        expect(commands[0]?.type).toBe("thread.turn.start");
        expect(commands[0]).toMatchObject({
          titleSeed: "Delegate: Current thread",
          message: {
            text: expect.stringContaining("## Delegated Task"),
          },
          bootstrap: {
            createThread: {
              projectId,
              branch: "main",
              worktreePath: "/tmp/mognet-tools",
            },
          },
        });
      }),
    ).pipe(Effect.provide(testLayer(commands)));
  }),
);

it.effect("uses distinct worktree refs for consecutive delegations from the same base", () =>
  Effect.gen(function* () {
    const commands: OrchestrationCommand[] = [];
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const server = yield* McpServer.McpServer;

        for (const prompt of ["Inspect the first task.", "Inspect the second task."]) {
          const delegated = yield* server
            .callTool({
              name: "mognet_delegate_task",
              arguments: {
                prompt,
                baseBranch: "main",
                startFromOrigin: true,
              },
            })
            .pipe(Effect.provideService(McpSchema.McpServerClient, client));
          expect(delegated.isError).toBe(false);
        }

        expect(commands).toHaveLength(2);
        const branches = commands.map((command) => {
          expect(command.type).toBe("thread.turn.start");
          if (command.type !== "thread.turn.start") return null;
          expect(command.bootstrap?.prepareWorktree).toMatchObject({
            baseBranch: "main",
            startFromOrigin: true,
          });
          return command.bootstrap?.prepareWorktree?.branch ?? null;
        });

        expect(branches[0]).toMatch(/^mognet\/[0-9a-f]{8}$/);
        expect(branches[1]).toMatch(/^mognet\/[0-9a-f]{8}$/);
        expect(branches[0]).not.toBe(branches[1]);
      }),
    ).pipe(Effect.provide(testLayer(commands)));
  }),
);
