/**
 * MognetProjectFileLoader - Effect service that loads the checked-in `mognet.json`
 * project file from a workspace root.
 *
 * Loading is best-effort: a missing file resolves to `Option.none`, and
 * unreadable or invalid files are logged and treated as absent so callers
 * can fall back to their defaults.
 *
 * @module MognetProjectFileLoader
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { MOGNET_PROJECT_FILE_NAME, type MognetProjectFile } from "@t3tools/contracts";
import { MognetProjectFileFromJson } from "@t3tools/shared/mognetProjectFile";

const decodeMognetProjectFileJson = Schema.decodeEffect(MognetProjectFileFromJson);

export class MognetProjectFileLoadError extends Schema.TaggedErrorClass<MognetProjectFileLoadError>()(
  "MognetProjectFileLoadError",
  {
    operation: Schema.Literals(["read", "decode"]),
    workspaceRoot: Schema.String,
    filePath: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to ${this.operation} ${MOGNET_PROJECT_FILE_NAME} at ${this.filePath}.`;
  }
}

/** Service tag for mognet.json project file loading. */
export class MognetProjectFileLoader extends Context.Service<
  MognetProjectFileLoader,
  {
    /**
     * Load and decode `mognet.json` at the workspace root.
     *
     * Never fails: missing, unreadable, or invalid files resolve to
     * `Option.none` (invalid files are logged as warnings).
     */
    readonly load: (workspaceRoot: string) => Effect.Effect<Option.Option<MognetProjectFile>>;
  }
>()("t3/project/MognetProjectFileLoader") {}

const logMognetProjectFileLoadError = (error: MognetProjectFileLoadError) =>
  Effect.logWarning(error).pipe(
    Effect.annotateLogs({
      operation: error.operation,
      workspaceRoot: error.workspaceRoot,
      filePath: error.filePath,
      errorTag: error._tag,
    }),
  );

export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const load: MognetProjectFileLoader["Service"]["load"] = Effect.fn(
    "MognetProjectFileLoader.load",
  )(function* (workspaceRoot) {
    const filePath = path.join(workspaceRoot, MOGNET_PROJECT_FILE_NAME);
    const raw = yield* fileSystem.readFileString(filePath).pipe(
      Effect.map(Option.some),
      Effect.catchTags({
        PlatformError: (error) =>
          error.reason._tag === "NotFound"
            ? Effect.succeed(Option.none<string>())
            : logMognetProjectFileLoadError(
                new MognetProjectFileLoadError({
                  operation: "read",
                  workspaceRoot,
                  filePath,
                  cause: error,
                }),
              ).pipe(Effect.as(Option.none<string>())),
      }),
    );
    if (Option.isNone(raw)) {
      return Option.none<MognetProjectFile>();
    }
    return yield* decodeMognetProjectFileJson(raw.value).pipe(
      Effect.map(Option.some),
      Effect.catchTags({
        SchemaError: (error) =>
          logMognetProjectFileLoadError(
            new MognetProjectFileLoadError({
              operation: "decode",
              workspaceRoot,
              filePath,
              cause: error,
            }),
          ).pipe(Effect.as(Option.none<MognetProjectFile>())),
      }),
    );
  });

  return MognetProjectFileLoader.of({ load });
});

export const layer = Layer.effect(MognetProjectFileLoader, make);
