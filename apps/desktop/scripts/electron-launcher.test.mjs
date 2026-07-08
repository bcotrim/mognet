import { assert, describe, it } from "vite-plus/test";

import {
  makeDevelopmentLauncherEnvironmentFile,
  makeDevelopmentLauncherScript,
  resolveElectronBinaryPath,
} from "./electron-launcher.mjs";

describe("electron development launcher", () => {
  it("keeps captured environment fallbacks out of the app executable", () => {
    const environmentFile = makeDevelopmentLauncherEnvironmentFile({
      environment: {
        VITE_DEV_SERVER_URL: "http://127.0.0.1:8526",
        MOGNET_PORT: "16566",
        MOGNET_HOME: "/tmp/mognet",
      },
    });
    const script = makeDevelopmentLauncherScript({
      electronBinaryPath: "/repo/node_modules/electron/Electron",
      mainEntryPath: "/repo/apps/desktop/dist-electron/main.cjs",
      desktopRoot: "/repo/apps/desktop",
      environmentFilePath: "/repo/apps/desktop/.electron-runtime/dev-launcher-env.sh",
    });

    assert.include(
      environmentFile,
      "if [ -z \"${VITE_DEV_SERVER_URL:-}\" ]; then export VITE_DEV_SERVER_URL='http://127.0.0.1:8526'; fi",
    );
    assert.notInclude(script, "\nexport VITE_DEV_SERVER_URL=");
    assert.notInclude(script, "http://127.0.0.1:8526");
    assert.include(
      script,
      "MOGNET_DEV_LAUNCHER_ENV='/repo/apps/desktop/.electron-runtime/dev-launcher-env.sh'",
    );
    assert.include(
      script,
      "exec '/repo/node_modules/electron/Electron' --mognet-dev-root='/repo/apps/desktop' '/repo/apps/desktop/dist-electron/main.cjs' \"$@\"",
    );
  });

  it("repairs Electron before loading the package entrypoint", () => {
    const calls = [];
    const electronPath = resolveElectronBinaryPath({
      ensureRuntime: () => {
        calls.push("ensure");
      },
      createRequire: () => (specifier) => {
        calls.push(`require:${specifier}`);
        return "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron";
      },
      moduleUrl: import.meta.url,
    });

    assert.equal(
      electronPath,
      "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
    );
    assert.deepEqual(calls, ["ensure", "require:electron"]);
  });
});
