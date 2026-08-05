import { WS_METHODS } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  environmentRpcKey,
} from "./runtime.ts";
import type { EnvironmentRegistry } from "../connection/registry.ts";

export function createReviewEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const diffFileScheduler = createAtomCommandScheduler();
  return {
    diffPreview: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:review:diff-preview",
      tag: WS_METHODS.reviewGetDiffPreview,
      staleTimeMs: 5_000,
      refreshIntervalMs: 5_000,
    }),
    openSnapshot: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:review:open-snapshot",
      tag: WS_METHODS.reviewOpenSnapshot,
      concurrency: {
        mode: "singleFlight",
        key: environmentRpcKey,
      },
    }),
    snapshot: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:review:snapshot",
      tag: WS_METHODS.reviewGetSnapshot,
      staleTimeMs: 2_000,
      refreshIntervalMs: 3_000,
    }),
    snapshots: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:review:snapshots",
      tag: WS_METHODS.reviewListSnapshots,
      staleTimeMs: 5_000,
    }),
    refreshSnapshot: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:review:refresh-snapshot",
      tag: WS_METHODS.reviewRefreshSnapshot,
      concurrency: {
        mode: "singleFlight",
        key: environmentRpcKey,
      },
    }),
    diffFileContents: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:review:diff-file-contents",
      tag: WS_METHODS.reviewGetDiffFileContents,
      scheduler: diffFileScheduler,
      concurrency: {
        mode: "singleFlight",
        key: ({ environmentId, input }) =>
          JSON.stringify([
            environmentId,
            input.cwd,
            input.sourceKind,
            input.baseRef,
            input.headRef,
            input.oldPath,
            input.newPath,
            input.changeType,
          ]),
      },
    }),
  };
}
