import { ThreadId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { prStatusIndicator, ThreadWorktreeIndicator } from "./ThreadStatusIndicators";

describe("prStatusIndicator", () => {
  it("uses purple for merged change requests", () => {
    expect(
      prStatusIndicator(
        {
          number: 15,
          title: "Use updated splash icon",
          url: "https://github.com/bcotrim/mognet/pull/15",
          baseRef: "main",
          headRef: "mognet/fix-web-icon-background",
          state: "merged",
        },
        { kind: "github", name: "GitHub", baseUrl: "https://github.com" },
      ),
    ).toMatchObject({
      label: "PR merged",
      colorClass: "text-purple-400",
    });
  });

  it("surfaces failing checks before the open state", () => {
    expect(
      prStatusIndicator(
        {
          number: 16,
          title: "Run branch checks",
          url: "https://github.com/bcotrim/mognet/pull/16",
          baseRef: "main",
          headRef: "mognet/checks",
          state: "open",
          checks: {
            status: "failing",
            totalCount: 3,
            failedCount: 1,
            pendingCount: 0,
          },
        },
        { kind: "github", name: "GitHub", baseUrl: "https://github.com" },
      ),
    ).toMatchObject({
      label: "PR checks failing",
      colorClass: "text-destructive-foreground",
      tooltip: "#16 PR checks failing: Run branch checks",
    });
  });

  it("surfaces merge conflicts before the open state", () => {
    expect(
      prStatusIndicator(
        {
          number: 17,
          title: "Resolve generated output",
          url: "https://github.com/bcotrim/mognet/pull/17",
          baseRef: "main",
          headRef: "mognet/conflicts",
          state: "open",
          mergeStatus: "conflicting",
        },
        { kind: "github", name: "GitHub", baseUrl: "https://github.com" },
      ),
    ).toMatchObject({
      label: "PR conflicts",
      colorClass: "text-destructive-foreground",
      tooltip: "#17 PR conflicts: Resolve generated output",
    });
  });
});

describe("ThreadWorktreeIndicator", () => {
  it("renders the worktree folder and branch in an accessible label", () => {
    const markup = renderToStaticMarkup(
      <ThreadWorktreeIndicator
        thread={{
          id: ThreadId.make("thread-1"),
          branch: "feature/sidebar-indicator",
          worktreePath: "/tmp/worktrees/sidebar-indicator",
        }}
      />,
    );

    expect(markup).toContain('role="img"');
    expect(markup).toContain(
      'aria-label="Worktree: sidebar-indicator (feature/sidebar-indicator)"',
    );
    expect(markup).toContain('data-testid="thread-worktree-thread-1"');
  });

  it.each([null, "", "   "])("renders nothing for an absent worktree path", (worktreePath) => {
    const markup = renderToStaticMarkup(
      <ThreadWorktreeIndicator
        thread={{
          id: ThreadId.make("thread-1"),
          branch: "main",
          worktreePath,
        }}
      />,
    );

    expect(markup).toBe("");
  });
});
