import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { getArchiveWorktreeChangesWarning, ThreadArchiveBlockedError } from "./useThreadActions";

describe("getArchiveWorktreeChangesWarning", () => {
  it("warns only when archiving would leave local changes disposable", () => {
    expect(getArchiveWorktreeChangesWarning("/tmp/worktrees/feature-a", false)).toBeNull();
    expect(getArchiveWorktreeChangesWarning("/tmp/worktrees/feature-a", true)).toBe(
      [
        'Worktree "feature-a" has uncommitted changes.',
        "Archiving makes it eligible for automatic cleanup, which may permanently discard them.",
        "",
        "Archive anyway?",
      ].join("\n"),
    );
  });
});

describe("ThreadArchiveBlockedError", () => {
  it("keeps the blocked thread context with the fixed message", () => {
    const error = new ThreadArchiveBlockedError({
      environmentId: EnvironmentId.make("environment-1"),
      threadId: ThreadId.make("thread-1"),
    });

    expect(error).toMatchObject({
      environmentId: "environment-1",
      threadId: "thread-1",
    });
    expect(error.message).toBe("Cannot archive a running thread.");
  });
});
