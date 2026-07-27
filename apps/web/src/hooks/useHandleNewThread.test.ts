import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_SERVER_SETTINGS, ProviderInstanceId } from "@t3tools/contracts";
import { resolveNewThreadDefaults, resolveNewDraftModelSelection } from "./useHandleNewThread";

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

describe("resolveNewDraftModelSelection", () => {
  it("prefers the project default over inherited draft state", () => {
    const projectDefault = {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.6",
    };
    const inherited = {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.4",
    };

    expect(resolveNewDraftModelSelection(projectDefault, inherited)).toBe(projectDefault);
    expect(resolveNewDraftModelSelection(null, inherited)).toBe(inherited);
    expect(resolveNewDraftModelSelection(null, null)).toBeNull();
  });
});
