import { describe, expect, it, vi } from "vite-plus/test";
import { EnvironmentId } from "@t3tools/contracts";

import {
  authClientMetadata,
  redactPairingCredential,
  toStableSavedRemoteConnection,
} from "./connection";

vi.mock("./runtime", () => ({
  runtime: {
    runPromise: vi.fn(),
  },
}));

vi.mock("react-native", () => ({
  Platform: {
    OS: "ios",
  },
}));

describe("mobile remote connection records", () => {
  it("identifies mobile token exchanges for authorized-client presentation", () => {
    expect(authClientMetadata()).toEqual({
      label: "Mognet Mobile",
      deviceType: "mobile",
      os: "iOS",
    });
  });

  it("removes one-time bootstrap credentials before persisting pairing URLs", () => {
    expect(redactPairingCredential("https://desktop.example/#token=bootstrap-token")).toBe(
      "https://desktop.example/",
    );
    expect(redactPairingCredential("https://desktop.example/?token=bootstrap-token")).toBe(
      "https://desktop.example/",
    );
  });

  it("keeps stable saved records unchanged", () => {
    const connection = {
      environmentId: EnvironmentId.make("environment-1"),
      environmentLabel: "Desktop",
      pairingUrl: "https://desktop.example/",
      displayUrl: "https://desktop.example/",
      httpBaseUrl: "https://desktop.example/",
      wsBaseUrl: "wss://desktop.example/",
      bearerToken: "session-token",
    } as const;

    expect(toStableSavedRemoteConnection(connection)).toEqual(connection);
  });
});
