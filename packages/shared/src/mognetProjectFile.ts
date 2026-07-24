import * as Schema from "effect/Schema";

import { MognetProjectFile, MOGNET_PROJECT_FILE_SCHEMA_URL } from "@t3tools/contracts";

import { fromLenientJson } from "./schemaJson.ts";

/**
 * Codec between the raw `mognet.json` file contents (lenient JSONC string) and the
 * decoded {@link MognetProjectFile}.
 */
export const MognetProjectFileFromJson = fromLenientJson(MognetProjectFile);

/**
 * Build the publishable JSON Schema document for `mognet.json` (draft 2020-12).
 *
 * Served from the marketing site at {@link MOGNET_PROJECT_FILE_SCHEMA_URL} so
 * editors get LSP support via a `$schema` reference.
 */
export function buildMognetProjectFileJsonSchema(): Record<string, unknown> {
  const document = Schema.toJsonSchemaDocument(MognetProjectFile);
  const jsonSchema: Record<string, unknown> = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: MOGNET_PROJECT_FILE_SCHEMA_URL,
    ...document.schema,
  };
  if (document.definitions && Object.keys(document.definitions).length > 0) {
    jsonSchema.$defs = document.definitions;
  }
  return jsonSchema;
}
