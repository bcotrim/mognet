import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { vi } from "vite-plus/test";

import type * as Electron from "electron";

import * as ElectronDialog from "../electron/ElectronDialog.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as DesktopCloseGuard from "./DesktopCloseGuard.ts";

function makeTestLayer(confirm: ElectronDialog.ElectronDialog["Service"]["confirm"]) {
  const owner = { id: 42 } as Electron.BrowserWindow;
  return DesktopCloseGuard.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(ElectronDialog.ElectronDialog, {
          pickFolder: () => Effect.succeed(Option.none()),
          confirm,
          showMessageBox: () => Effect.die("unexpected showMessageBox"),
          showErrorBox: () => Effect.void,
        }),
        Layer.succeed(ElectronWindow.ElectronWindow, {
          create: () => Effect.die("unexpected create"),
          main: Effect.succeed(Option.some(owner)),
          currentMainOrFirst: Effect.succeed(Option.some(owner)),
          focusedMainOrFirst: Effect.succeed(Option.some(owner)),
          setMain: () => Effect.void,
          clearMain: () => Effect.void,
          reveal: () => Effect.void,
          sendAll: () => Effect.void,
          destroyAll: Effect.void,
          syncAllAppearance: () => Effect.void,
        }),
      ),
    ),
  );
}

describe("DesktopCloseGuard", () => {
  it.effect("skips confirmation when no sessions are running", () => {
    const confirm = vi.fn(() => Effect.succeed(false));

    return Effect.gen(function* () {
      const closeGuard = yield* DesktopCloseGuard.DesktopCloseGuard;

      assert.isTrue(yield* closeGuard.confirmClose);
      assert.equal(confirm.mock.calls.length, 0);
    }).pipe(Effect.provide(makeTestLayer(confirm)));
  });

  it.effect("confirms close with the current running-session count", () => {
    const confirm = vi.fn((_input: ElectronDialog.ElectronDialogConfirmInput) =>
      Effect.succeed(true),
    );

    return Effect.gen(function* () {
      const closeGuard = yield* DesktopCloseGuard.DesktopCloseGuard;
      yield* closeGuard.setRunningSessionCount(2);

      assert.isTrue(closeGuard.shouldConfirmClose());
      assert.isTrue(yield* closeGuard.confirmClose);
      assert.equal(confirm.mock.calls.length, 1);
      assert.equal(
        confirm.mock.calls[0]?.[0].message,
        "2 sessions are still running. Closing Mognet may interrupt active work. Close anyway?",
      );
    }).pipe(Effect.provide(makeTestLayer(confirm)));
  });

  it.effect("consumes a one-time app quit grant", () => {
    const confirm = vi.fn(() => Effect.succeed(true));

    return Effect.gen(function* () {
      const closeGuard = yield* DesktopCloseGuard.DesktopCloseGuard;

      assert.isFalse(yield* closeGuard.consumeNextAppQuitGrant);
      yield* closeGuard.grantNextAppQuit;
      assert.isTrue(yield* closeGuard.consumeNextAppQuitGrant);
      assert.isFalse(yield* closeGuard.consumeNextAppQuitGrant);
    }).pipe(Effect.provide(makeTestLayer(confirm)));
  });

  it.effect("disables further prompts once app quit is allowed", () => {
    const confirm = vi.fn(() => Effect.succeed(false));

    return Effect.gen(function* () {
      const closeGuard = yield* DesktopCloseGuard.DesktopCloseGuard;
      yield* closeGuard.setRunningSessionCount(1);
      yield* closeGuard.allowAppQuit;

      assert.isFalse(closeGuard.shouldConfirmClose());
      assert.isTrue(yield* closeGuard.confirmClose);
      assert.equal(confirm.mock.calls.length, 0);
    }).pipe(Effect.provide(makeTestLayer(confirm)));
  });
});
