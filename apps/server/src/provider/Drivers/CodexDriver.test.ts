// @effect-diagnostics nodeBuiltinImport:off
import { expect, it } from "@effect/vitest";
import * as NodeFS from "node:fs";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";

import { resolveProviderMaintenanceCapabilitiesEffect } from "../providerMaintenance.ts";
import { codexMaintenanceCapabilitiesResolver } from "./CodexDriver.ts";

it.layer(NodeServices.layer)("CodexDriver maintenance", (it) => {
  it.effect("uses the standalone installer for Codex standalone releases", () =>
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto;
      const tempDir = NodePath.join(
        NodeOS.tmpdir(),
        `t3-codex-standalone-${yield* crypto.randomUUIDv4}`,
      );
      const binDir = NodePath.join(tempDir, ".local", "bin");
      const releaseDir = NodePath.join(
        tempDir,
        ".codex",
        "packages",
        "standalone",
        "releases",
        "0.144.3-aarch64-apple-darwin",
        "bin",
      );
      NodeFS.mkdirSync(binDir, { recursive: true });
      NodeFS.mkdirSync(releaseDir, { recursive: true });
      const releasePath = NodePath.join(releaseDir, "codex");
      const symlinkPath = NodePath.join(binDir, "codex");
      NodeFS.writeFileSync(releasePath, "#!/bin/sh\n");
      NodeFS.chmodSync(releasePath, 0o755);
      NodeFS.symlinkSync(releasePath, symlinkPath);

      const capabilities = yield* resolveProviderMaintenanceCapabilitiesEffect(
        codexMaintenanceCapabilitiesResolver,
        {
          binaryPath: "codex",
          env: { PATH: binDir },
        },
      );

      expect(capabilities).toEqual({
        provider: "codex",
        packageName: "@openai/codex",
        update: {
          command:
            "sh -c 'curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh'",
          executable: "sh",
          args: [
            "-c",
            "curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh",
          ],
          lockKey: "codex-standalone",
        },
      });
    }),
  );
});
