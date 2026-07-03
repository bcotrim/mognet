import { WS_METHODS } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  environmentRpcKey,
} from "./runtime.ts";
import type { EnvironmentRegistry } from "../connection/registry.ts";

export function createReviewEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    diffPreview: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:review:diff-preview",
      tag: WS_METHODS.reviewGetDiffPreview,
      staleTimeMs: 5_000,
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
  };
}
