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

/**
 * Scripts declared in the project's checked-in `mognet.json`, offered in the
 * scripts menu for import. Missing, truncated, or invalid files resolve to
 * an empty list.
 */
export function useMognetProjectFileScripts(
  environmentId: EnvironmentId,
  cwd: string | null,
): ReadonlyArray<MognetProjectFileScript> {
  const query = useProjectFileQuery(
    environmentId,
    cwd ?? "",
    MOGNET_PROJECT_FILE_NAME,
    cwd !== null,
  );
  const contents = query.data && !query.data.truncated ? query.data.contents : null;
  return useMemo(() => {
    if (contents === null) return NO_SCRIPTS;
    const decoded = decodeMognetProjectFile(contents);
    if (Exit.isFailure(decoded)) return NO_SCRIPTS;
    return decoded.value.scripts ?? NO_SCRIPTS;
  }, [contents]);
}
