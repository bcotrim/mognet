import {
  MOGNET_PROJECT_FILE_NAME,
  type EnvironmentId,
  type MognetProjectFileScript,
} from "@t3tools/contracts";
import { MognetProjectFileFromJson } from "@t3tools/shared/mognetProjectFile";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import { useMemo } from "react";

import { useProjectFileQuery } from "~/components/files/projectFilesQueryState";

const decodeMognetProjectFile = Schema.decodeExit(MognetProjectFileFromJson);

const NO_SCRIPTS: ReadonlyArray<MognetProjectFileScript> = [];

export interface MognetProjectFileState {
  /**
   * - `valid`: mognet.json exists and decoded.
   * - `invalid`: mognet.json exists but fails to decode (the server then ignores
   *   the whole file, including `iconPath` and every script).
   * - `missing`: no readable mognet.json at the workspace root.
   * - `loading`: the file query has not settled yet.
   */
  status: "loading" | "missing" | "invalid" | "valid";
  scripts: ReadonlyArray<MognetProjectFileScript>;
}

/**
 * Decoded state of the project's checked-in `mognet.json`, including whether the
 * file exists but is broken — which the runtime otherwise swallows silently.
 */
export function useMognetProjectFileState(
  environmentId: EnvironmentId,
  cwd: string | null,
): MognetProjectFileState {
  const query = useProjectFileQuery(
    environmentId,
    cwd ?? "",
    MOGNET_PROJECT_FILE_NAME,
    cwd !== null,
  );
  const contents = query.data && !query.data.truncated ? query.data.contents : null;
  const isPending = query.isPending;
  return useMemo(() => {
    if (contents === null) {
      return { status: isPending ? "loading" : "missing", scripts: NO_SCRIPTS } as const;
    }
    const decoded = decodeMognetProjectFile(contents);
    if (Exit.isFailure(decoded)) {
      return { status: "invalid", scripts: NO_SCRIPTS } as const;
    }
    return { status: "valid", scripts: decoded.value.scripts ?? NO_SCRIPTS } as const;
  }, [contents, isPending]);
}

/**
 * Scripts declared in the project's checked-in `mognet.json`, offered in the
 * scripts menu for import. Missing, truncated, or invalid files resolve to
 * an empty list.
 */
export function useMognetProjectFileScripts(
  environmentId: EnvironmentId,
  cwd: string | null,
): ReadonlyArray<MognetProjectFileScript> {
  return useMognetProjectFileState(environmentId, cwd).scripts;
}
