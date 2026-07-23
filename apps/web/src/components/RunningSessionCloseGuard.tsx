import type { OrchestrationSessionStatus } from "@t3tools/contracts";
import { useEffect } from "react";

import { useThreadShells } from "../state/entities";

interface ThreadSessionState {
  readonly session: {
    readonly status: OrchestrationSessionStatus;
  } | null;
}

export function countRunningSessions(threads: readonly ThreadSessionState[]): number {
  return threads.reduce(
    (count, thread) => count + (thread.session?.status === "running" ? 1 : 0),
    0,
  );
}

export function preventCloseWithRunningSessions(event: BeforeUnloadEvent): void {
  event.preventDefault();
  event.returnValue = "";
}

export function RunningSessionCloseGuard() {
  const runningSessionCount = countRunningSessions(useThreadShells());

  useEffect(() => {
    const setRunningSessionCount = window.desktopBridge?.setRunningSessionCount;
    if (setRunningSessionCount) {
      void setRunningSessionCount(runningSessionCount).catch(() => undefined);
      return;
    }
    if (runningSessionCount === 0) return;

    window.addEventListener("beforeunload", preventCloseWithRunningSessions);
    return () => {
      window.removeEventListener("beforeunload", preventCloseWithRunningSessions);
    };
  }, [runningSessionCount]);

  return null;
}
