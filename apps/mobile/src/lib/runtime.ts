import * as ExpoCrypto from "expo-crypto";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as PlatformError from "effect/PlatformError";
import * as Socket from "effect/unstable/socket/Socket";

import { remoteHttpClientLayer } from "@t3tools/client-runtime/rpc";

import { tracingLayer } from "../features/observability/tracing";

const httpClientLayer = remoteHttpClientLayer(fetch);
const toExpoDigestAlgorithm = (
  algorithm: Crypto.DigestAlgorithm,
): ExpoCrypto.CryptoDigestAlgorithm => {
  switch (algorithm) {
    case "SHA-1":
      return ExpoCrypto.CryptoDigestAlgorithm.SHA1;
    case "SHA-256":
      return ExpoCrypto.CryptoDigestAlgorithm.SHA256;
    case "SHA-384":
      return ExpoCrypto.CryptoDigestAlgorithm.SHA384;
    case "SHA-512":
      return ExpoCrypto.CryptoDigestAlgorithm.SHA512;
  }
};
const cryptoLayer = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes: ExpoCrypto.getRandomBytes,
    digest: (algorithm, data) =>
      Effect.tryPromise({
        try: async () => {
          const input = new ArrayBuffer(data.byteLength);
          new Uint8Array(input).set(data);
          return new Uint8Array(await ExpoCrypto.digest(toExpoDigestAlgorithm(algorithm), input));
        },
        catch: (cause) =>
          PlatformError.systemError({
            _tag: "Unknown",
            module: "MobileCrypto",
            method: "digest",
            cause,
          }),
      }),
  }),
);

type RuntimeLayerSource =
  | typeof Socket.layerWebSocketConstructorGlobal
  | typeof httpClientLayer
  | typeof cryptoLayer
  | typeof tracingLayer;

const runtimeLayer = Socket.layerWebSocketConstructorGlobal.pipe(
  Layer.provideMerge(httpClientLayer),
  Layer.provideMerge(cryptoLayer),
  Layer.provideMerge(tracingLayer.pipe(Layer.provide(httpClientLayer))),
);

export const runtime: ManagedRuntime.ManagedRuntime<
  Layer.Success<RuntimeLayerSource>,
  Layer.Error<RuntimeLayerSource>
> = ManagedRuntime.make(runtimeLayer);

export const runtimeContextLayer: Layer.Layer<
  Layer.Success<RuntimeLayerSource>,
  Layer.Error<RuntimeLayerSource>
> = Layer.effectContext(runtime.contextEffect);
