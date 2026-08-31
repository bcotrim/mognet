import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_SERVER_SETTINGS, ProviderInstanceId } from "@t3tools/contracts";
import { resolveNewThreadDefaults } from "./useHandleNewThread";
import { resolveNewThreadModelSelectionOverride } from "../lib/chatThreadActions";

describe("resolveNewThreadDefaults", () => {
  it("applies the origin default only for new worktree mode", () => {
    expect(
      resolveNewThreadDefaults({
        ...DEFAULT_SERVER_SETTINGS,
        defaultThreadEnvMode: "worktree",
        newWorktreesStartFromOrigin: true,
      }),
    ).toEqual({
      branch: null,
      envMode: "worktree",
      startFromOrigin: true,
    });

    expect(
      resolveNewThreadDefaults({
        ...DEFAULT_SERVER_SETTINGS,
        defaultThreadEnvMode: "local",
        newWorktreesStartFromOrigin: true,
      }),
    ).toEqual({
      branch: null,
      envMode: "local",
      startFromOrigin: false,
    });

    expect(
      resolveNewThreadDefaults(
        {
          ...DEFAULT_SERVER_SETTINGS,
          defaultThreadEnvMode: "local",
          newWorktreesStartFromOrigin: false,
        },
        "develop",
      ),
    ).toEqual({
      branch: "develop",
      envMode: "local",
      startFromOrigin: false,
    });
  });
});

describe("resolveNewThreadModelSelectionOverride", () => {
  const projectDefault = {
    instanceId: ProviderInstanceId.make("codex-personal"),
    model: "gpt-5.6",
    options: [
      { id: "reasoningEffort", value: "high" },
      { id: "fastMode", value: true },
    ],
  } as const;
  const inherited = {
    instanceId: ProviderInstanceId.make("codex"),
    model: "gpt-5.4",
    options: [{ id: "reasoningEffort", value: "low" }],
  } as const;

  it("prefers the project model and provider options for fresh drafts", () => {
    expect(
      resolveNewThreadModelSelectionOverride({
        projectDefaultSelection: projectDefault,
        carrySelection: inherited,
        carrySourceDraftId: "draft-a",
        destinationDraftId: "draft-b",
      }),
    ).toBe(projectDefault);
  });

  it("replaces stale reused-draft model state with the project default", () => {
    expect(
      resolveNewThreadModelSelectionOverride({
        projectDefaultSelection: projectDefault,
        carrySelection: inherited,
        carrySourceDraftId: "draft-a",
        destinationDraftId: "draft-a",
      }),
    ).toBe(projectDefault);
  });

  it("falls back to inherited state when the project has no default", () => {
    expect(
      resolveNewThreadModelSelectionOverride({
        projectDefaultSelection: null,
        carrySelection: inherited,
        carrySourceDraftId: "draft-a",
        destinationDraftId: "draft-b",
      }),
    ).toBe(inherited);
    expect(
      resolveNewThreadModelSelectionOverride({
        projectDefaultSelection: null,
        carrySelection: null,
        carrySourceDraftId: null,
        destinationDraftId: "draft-b",
      }),
    ).toBeNull();
  });
});
