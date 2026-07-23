import { describe, expect, it, vi } from "vite-plus/test";

import { countRunningSessions, preventCloseWithRunningSessions } from "./RunningSessionCloseGuard";

describe("RunningSessionCloseGuard", () => {
  it("counts only sessions in the running state", () => {
    expect(
      countRunningSessions([
        { session: null },
        { session: { status: "ready" } },
        { session: { status: "starting" } },
        { session: { status: "running" } },
        { session: { status: "running" } },
        { session: { status: "stopped" } },
      ]),
    ).toBe(2);
  });

  it("prevents browser unload while sessions are running", () => {
    const preventDefault = vi.fn();
    const event = {
      preventDefault,
      returnValue: undefined,
    } as unknown as BeforeUnloadEvent;

    preventCloseWithRunningSessions(event);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe("");
  });
});
