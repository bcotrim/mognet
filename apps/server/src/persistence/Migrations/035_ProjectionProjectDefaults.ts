import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_projects
    ADD COLUMN default_thread_env_mode TEXT NOT NULL DEFAULT 'local'
  `.pipe(Effect.catch(() => Effect.void));

  yield* sql`
    ALTER TABLE projection_projects
    ADD COLUMN new_worktrees_start_from_origin INTEGER NOT NULL DEFAULT 0
  `.pipe(Effect.catch(() => Effect.void));

  yield* sql`
    ALTER TABLE projection_projects
    ADD COLUMN text_generation_model_selection_json TEXT NOT NULL DEFAULT '{"instanceId":"codex","model":"gpt-5.4-mini"}'
  `.pipe(Effect.catch(() => Effect.void));
});
