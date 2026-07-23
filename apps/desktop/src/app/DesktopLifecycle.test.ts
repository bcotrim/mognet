import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

import type * as Electron from "electron";

import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronTheme from "../electron/ElectronTheme.ts";
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
      on: (eventName, listener) =>
        Effect.sync(() => {
          listeners.set(eventName, listener as AppListener);
        }),
    }),
    Layer.mock(ElectronTheme.ElectronTheme)({
      onUpdated: () => Effect.void,
    }),
  );

  return { events, layer, listeners, quitCompleted };
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
          "shutdown-request",
          "shutdown-complete",
          "allow-quit",
          "quit",
        ]);
        assert.isTrue(yield* Ref.get(state.quitting));
      }),
    ).pipe(Effect.provide(harness.layer));
  });
});
