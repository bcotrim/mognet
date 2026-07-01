import Constants from "expo-constants";
import * as Layer from "effect/Layer";

export interface TracingConfig {
  readonly tracesUrl: string;
  readonly tracesDataset: string;
  readonly tracesToken: string;
}

export interface TracingResource {
  readonly serviceVersion?: string;
  readonly appVariant: string;
}

export function resolveTracingConfig(): TracingConfig | null {
  return null;
}

export function makeTracingLayer(_config: TracingConfig | null, _resource: TracingResource) {
  return Layer.empty;
}

export const tracingLayer = makeTracingLayer(resolveTracingConfig(), {
  serviceVersion: Constants.expoConfig?.version,
  appVariant:
    typeof Constants.expoConfig?.extra?.appVariant === "string"
      ? Constants.expoConfig.extra.appVariant
      : "unknown",
});
