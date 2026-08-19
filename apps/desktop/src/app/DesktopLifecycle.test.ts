import { assert, describe, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

import type * as Electron from "electron";

import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronTheme from "../electron/ElectronTheme.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";
import * as DesktopCloseGuard from "./DesktopCloseGuard.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopLifecycle from "./DesktopLifecycle.ts";
import * as DesktopShutdown from "./DesktopShutdown.ts";
import * as DesktopState from "./DesktopState.ts";

type AppListener = (...args: readonly unknown[]) => void;

function makeHarness(confirmClose: Effect.Effect<boolean>) {
  const events: string[] = [];
  const listeners = new Map<string, AppListener>();
  let resolveQuit = () => {};
  const quitCompleted = new Promise<void>((resolve) => {
    resolveQuit = resolve;
  });
  const closeGuard = DesktopCloseGuard.DesktopCloseGuard.of({
    setRunningSessionCount: () => Effect.void,
    shouldConfirmClose: () => true,
    confirmClose: Effect.sync(() => {
      events.push("confirm");
    }).pipe(Effect.andThen(confirmClose)),
    grantNextAppQuit: Effect.void,
    consumeNextAppQuitGrant: Effect.succeed(false),
    allowAppQuit: Effect.sync(() => {
      events.push("allow-quit");
    }),
  });

  const layer = Layer.mergeAll(
    Layer.succeed(DesktopCloseGuard.DesktopCloseGuard, closeGuard),
    Layer.succeed(DesktopEnvironment.DesktopEnvironment, {
      platform: "win32",
    } as DesktopEnvironment.DesktopEnvironment["Service"]),
    Layer.mock(DesktopShutdown.DesktopShutdown)({
      request: Effect.sync(() => {
        events.push("shutdown-request");
      }),
      awaitComplete: Effect.sync(() => {
        events.push("shutdown-complete");
      }),
    }),
    DesktopState.layer,
    Layer.mock(DesktopWindow.DesktopWindow)({
      flushMainWindowBounds: Effect.sync(() => {
        events.push("flush-bounds");
      }),
    }),
    Layer.mock(ElectronApp.ElectronApp)({
      quit: Effect.sync(() => {
        events.push("quit");
        resolveQuit();
      }),
      onBeforeQuitForUpdate: (listener) =>
        Effect.sync(() => {
          listeners.set("before-quit-for-update", listener);
        }),
      on: (eventName, listener) =>
        Effect.sync(() => {
          listeners.set(eventName, listener as AppListener);
        }),
    }),
    Layer.mock(ElectronTheme.ElectronTheme)({
      onUpdated: () => Effect.void,
    }),
    Layer.mock(ElectronWindow.ElectronWindow)({
      destroyAll: Effect.sync(() => {
        events.push("destroy-windows");
      }),
    }),
  );

  return { events, layer, listeners, quitCompleted };
}

function makeElectronAppLayer(
  appListeners: Map<string, (...args: readonly unknown[]) => void>,
  quit: Effect.Effect<void> = Effect.void,
) {
  const registerListener = (eventName: string, listener: (...args: readonly unknown[]) => void) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        appListeners.set(eventName, listener);
      }),
      () =>
        Effect.sync(() => {
          appListeners.delete(eventName);
        }),
    ).pipe(Effect.asVoid);

  return Layer.succeed(ElectronApp.ElectronApp, {
    metadata: Effect.die("unexpected metadata read"),
    name: Effect.succeed("T3 Code"),
    systemLocale: Effect.succeed("en-US"),
    whenReady: Effect.void,
    quit,
    exit: () => Effect.void,
    relaunch: () => Effect.void,
    setPath: () => Effect.void,
    setName: () => Effect.void,
    setAboutPanelOptions: () => Effect.void,
    setAppUserModelId: () => Effect.void,
    getAppMetrics: Effect.succeed([]),
    isDefaultProtocolClient: () => Effect.succeed(false),
    setAsDefaultProtocolClient: () => Effect.succeed(true),
    setDesktopName: () => Effect.void,
    setDockIcon: () => Effect.void,
    appendCommandLineSwitch: () => Effect.void,
    removeCommandLineSwitch: () => Effect.void,
    onBeforeQuitForUpdate: (listener) => registerListener("before-quit-for-update", listener),
    on: (eventName, listener) =>
      registerListener(eventName, listener as unknown as (...args: readonly unknown[]) => void),
  } satisfies ElectronApp.ElectronApp["Service"]);
}

const electronThemeLayer = Layer.succeed(ElectronTheme.ElectronTheme, {
  shouldUseDarkColors: Effect.succeed(false),
  setSource: () => Effect.void,
  onUpdated: () => Effect.void,
});

function makeElectronWindowLayer(destroyAll: Effect.Effect<void> = Effect.void) {
  return Layer.succeed(ElectronWindow.ElectronWindow, {
    create: () => Effect.die("unexpected window creation"),
    main: Effect.die("unexpected main window read"),
    currentMainOrFirst: Effect.die("unexpected current window read"),
    focusedMainOrFirst: Effect.die("unexpected focused window read"),
    setMain: () => Effect.void,
    clearMain: () => Effect.void,
    reveal: () => Effect.void,
    sendAll: () => Effect.void,
    destroyAll,
    syncAllAppearance: () => Effect.void,
  });
}

function makeDesktopWindowLayer(
  input: {
    readonly activate?: Effect.Effect<void>;
    readonly flushMainWindowBounds?: Effect.Effect<void>;
  } = {},
) {
  return Layer.succeed(DesktopWindow.DesktopWindow, {
    createMain: Effect.die("unexpected window creation"),
    ensureMain: Effect.die("unexpected window creation"),
    revealOrCreateMain: Effect.die("unexpected window creation"),
    activate: input.activate ?? Effect.void,
    createMainIfBackendReady: Effect.void,
    showConnectingSplash: Effect.void,
    handleBackendReady: () => Effect.void,
    handleBackendNotReady: Effect.void,
    flushMainWindowBounds: input.flushMainWindowBounds ?? Effect.void,
    dispatchMenuAction: () => Effect.void,
    zoomMain: () => Effect.void,
    syncAppearance: Effect.void,
  });
}

describe("DesktopLifecycle", () => {
  it.effect("does not begin shutdown when running-session close is canceled", () => {
    const harness = makeHarness(Effect.succeed(false));

    return Effect.scoped(
      Effect.gen(function* () {
        yield* DesktopLifecycle.make.register;
        const beforeQuit = harness.listeners.get("before-quit");
        if (!beforeQuit) {
          return yield* Effect.die("before-quit listener was not registered");
        }
        const preventDefault = () => {
          harness.events.push("prevent");
        };

        beforeQuit({ preventDefault } as Electron.Event);
        yield* Effect.promise(() => Promise.resolve());

        const state = yield* DesktopState.DesktopState;
        assert.deepEqual(harness.events, ["prevent", "confirm"]);
        assert.isFalse(yield* Ref.get(state.quitting));
      }),
    ).pipe(Effect.provide(harness.layer));
  });

  it.effect("shuts down and quits only after running-session close is confirmed", () => {
    const harness = makeHarness(Effect.succeed(true));

    return Effect.scoped(
      Effect.gen(function* () {
        yield* DesktopLifecycle.make.register;
        const beforeQuit = harness.listeners.get("before-quit");
        if (!beforeQuit) {
          return yield* Effect.die("before-quit listener was not registered");
        }

        beforeQuit({
          preventDefault: () => {
            harness.events.push("prevent");
          },
        } as Electron.Event);
        yield* Effect.promise(() => harness.quitCompleted);

        const state = yield* DesktopState.DesktopState;
        assert.deepEqual(harness.events, [
          "prevent",
          "confirm",
          "flush-bounds",
          "destroy-windows",
          "shutdown-request",
          "shutdown-complete",
          "allow-quit",
          "quit",
        ]);
        assert.isTrue(yield* Ref.get(state.quitting));
      }),
    ).pipe(Effect.provide(harness.layer));
  });

  it.effect("lets the updater-controlled quit proceed", () => {
    const harness = makeHarness(Effect.succeed(false));

    return Effect.scoped(
      Effect.gen(function* () {
        yield* DesktopLifecycle.make.register;
        harness.listeners.get("before-quit-for-update")?.();
        harness.listeners.get("before-quit")?.({
          preventDefault: () => {
            harness.events.push("prevent");
          },
        } as Electron.Event);
        yield* Effect.promise(() => Promise.resolve());

        const state = yield* DesktopState.DesktopState;
        assert.deepEqual(harness.events, []);
        assert.isTrue(yield* Ref.get(state.quitting));
      }),
    ).pipe(Effect.provide(harness.layer));
  });
});
