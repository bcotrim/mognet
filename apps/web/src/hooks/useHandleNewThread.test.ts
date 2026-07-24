import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_SERVER_SETTINGS, ProviderInstanceId } from "@t3tools/contracts";
import {
  resolveNewThreadDefaults,
  shouldApplyInheritedModelStateToNewDraft,
} from "./useHandleNewThread";

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

describe("shouldApplyInheritedModelStateToNewDraft", () => {
  it("skips inherited model state when the project has its own default", () => {
    expect(
      shouldApplyInheritedModelStateToNewDraft({
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5.4",
      }),
    ).toBe(false);
    expect(shouldApplyInheritedModelStateToNewDraft(null)).toBe(true);
  });
});
