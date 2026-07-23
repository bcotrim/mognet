import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ElectronDialog from "../electron/ElectronDialog.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import { makeComponentLogger } from "./DesktopObservability.ts";

export class DesktopCloseGuard extends Context.Service<
  DesktopCloseGuard,
  {
    readonly setRunningSessionCount: (count: number) => Effect.Effect<void>;
    readonly shouldConfirmClose: () => boolean;
    readonly confirmClose: Effect.Effect<boolean>;
    readonly grantNextAppQuit: Effect.Effect<void>;
    readonly consumeNextAppQuitGrant: Effect.Effect<boolean>;
    readonly allowAppQuit: Effect.Effect<void>;
  }
>()("@t3tools/desktop/app/DesktopCloseGuard") {}

const { logWarning: logCloseGuardWarning } = makeComponentLogger("desktop-close-guard");

export function runningSessionClosePrompt(count: number): string {
  const runningSessions = count === 1 ? "A session is" : `${count} sessions are`;
  return `${runningSessions} still running. Closing Mognet may interrupt active work. Close anyway?`;
}

export const make = Effect.gen(function* () {
  const electronDialog = yield* ElectronDialog.ElectronDialog;
  const electronWindow = yield* ElectronWindow.ElectronWindow;
  let runningSessionCount = 0;
  let nextAppQuitGranted = false;
  let appQuitAllowed = false;

  const shouldConfirmClose = () => runningSessionCount > 0 && !appQuitAllowed;

  const confirmClose = Effect.fn("desktop.closeGuard.confirmClose")(
    function* () {
      if (!shouldConfirmClose()) return true;
      const owner = yield* electronWindow.focusedMainOrFirst;
      return yield* electronDialog.confirm({
        owner,
        message: runningSessionClosePrompt(runningSessionCount),
      });
    },
    Effect.catchCause((cause) =>
      logCloseGuardWarning("failed to confirm close with running sessions", { cause }).pipe(
        Effect.as(false),
      ),
    ),
  );

  return DesktopCloseGuard.of({
    setRunningSessionCount: (count) =>
      Effect.sync(() => {
        runningSessionCount = count;
      }),
    shouldConfirmClose,
    confirmClose: confirmClose(),
    grantNextAppQuit: Effect.sync(() => {
      nextAppQuitGranted = true;
    }),
    consumeNextAppQuitGrant: Effect.sync(() => {
      const granted = nextAppQuitGranted;
      nextAppQuitGranted = false;
      return granted;
    }),
    allowAppQuit: Effect.sync(() => {
      appQuitAllowed = true;
    }),
  });
});

export const layer = Layer.effect(DesktopCloseGuard, make);
