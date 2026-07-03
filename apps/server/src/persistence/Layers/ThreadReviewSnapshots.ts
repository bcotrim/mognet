import { ReviewSnapshot, ReviewSnapshotErrorInfo } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceDecodeError, toPersistenceSqlError } from "../Errors.ts";
import {
  FindReusableThreadReviewSnapshotInput,
  GetThreadReviewSnapshotInput,
  ListThreadReviewSnapshotsInput,
  ThreadReviewSnapshotRepository,
  ThreadReviewSnapshotRow,
  type ThreadReviewSnapshotRepositoryShape,
} from "../Services/ThreadReviewSnapshots.ts";

const ThreadReviewSnapshotDbRow = ThreadReviewSnapshotRow.mapFields(
  Struct.assign({
    snapshot: Schema.fromJsonString(ReviewSnapshot),
    error: Schema.NullOr(Schema.fromJsonString(ReviewSnapshotErrorInfo)),
  }),
);

function toPersistenceSqlOrDecodeError(sqlOperation: string, decodeOperation: string) {
  return (cause: unknown) =>
    Schema.isSchemaError(cause)
      ? toPersistenceDecodeError(decodeOperation)(cause)
      : toPersistenceSqlError(sqlOperation)(cause);
}

const makeThreadReviewSnapshotRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertThreadReviewSnapshotRow = SqlSchema.void({
    Request: ThreadReviewSnapshotRow,
    execute: (row) => sql`
      INSERT INTO thread_review_snapshots (
        review_id,
        thread_id,
        turn_id,
        origin,
        source_kind,
        source_id,
        cwd,
        base_ref,
        head_ref,
        diff_hash,
        status,
        snapshot_json,
        error_json,
        created_at,
        updated_at,
        completed_at
      )
      VALUES (
        ${row.reviewId},
        ${row.threadId},
        ${row.turnId},
        ${row.origin},
        ${row.sourceKind},
        ${row.sourceId},
        ${row.cwd},
        ${row.baseRef},
        ${row.headRef},
        ${row.diffHash},
        ${row.status},
        ${JSON.stringify(row.snapshot)},
        ${row.error === null ? null : JSON.stringify(row.error)},
        ${row.createdAt},
        ${row.updatedAt},
        ${row.completedAt}
      )
      ON CONFLICT (review_id)
      DO UPDATE SET
        thread_id = excluded.thread_id,
        turn_id = excluded.turn_id,
        origin = excluded.origin,
        source_kind = excluded.source_kind,
        source_id = excluded.source_id,
        cwd = excluded.cwd,
        base_ref = excluded.base_ref,
        head_ref = excluded.head_ref,
        diff_hash = excluded.diff_hash,
        status = excluded.status,
        snapshot_json = excluded.snapshot_json,
        error_json = excluded.error_json,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        completed_at = excluded.completed_at
    `,
  });

  const getThreadReviewSnapshotRow = SqlSchema.findOneOption({
    Request: GetThreadReviewSnapshotInput,
    Result: ThreadReviewSnapshotDbRow,
    execute: ({ reviewId }) => sql`
      SELECT
        review_id AS "reviewId",
        thread_id AS "threadId",
        turn_id AS "turnId",
        origin,
        source_kind AS "sourceKind",
        source_id AS "sourceId",
        cwd,
        base_ref AS "baseRef",
        head_ref AS "headRef",
        diff_hash AS "diffHash",
        status,
        snapshot_json AS "snapshot",
        error_json AS "error",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        completed_at AS "completedAt"
      FROM thread_review_snapshots
      WHERE review_id = ${reviewId}
    `,
  });

  const listThreadReviewSnapshotRows = SqlSchema.findAll({
    Request: ListThreadReviewSnapshotsInput,
    Result: ThreadReviewSnapshotDbRow,
    execute: ({ threadId }) => sql`
      SELECT
        review_id AS "reviewId",
        thread_id AS "threadId",
        turn_id AS "turnId",
        origin,
        source_kind AS "sourceKind",
        source_id AS "sourceId",
        cwd,
        base_ref AS "baseRef",
        head_ref AS "headRef",
        diff_hash AS "diffHash",
        status,
        snapshot_json AS "snapshot",
        error_json AS "error",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        completed_at AS "completedAt"
      FROM thread_review_snapshots
      WHERE thread_id = ${threadId}
      ORDER BY created_at ASC, review_id ASC
    `,
  });

  const findReusableThreadReviewSnapshotRow = SqlSchema.findOneOption({
    Request: FindReusableThreadReviewSnapshotInput,
    Result: ThreadReviewSnapshotDbRow,
    execute: ({ threadId, sourceKind, sourceId, diffHash }) => sql`
      SELECT
        review_id AS "reviewId",
        thread_id AS "threadId",
        turn_id AS "turnId",
        origin,
        source_kind AS "sourceKind",
        source_id AS "sourceId",
        cwd,
        base_ref AS "baseRef",
        head_ref AS "headRef",
        diff_hash AS "diffHash",
        status,
        snapshot_json AS "snapshot",
        error_json AS "error",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        completed_at AS "completedAt"
      FROM thread_review_snapshots
      WHERE thread_id = ${threadId}
        AND source_kind = ${sourceKind}
        AND source_id = ${sourceId}
        AND diff_hash = ${diffHash}
        AND status = 'ready'
      ORDER BY created_at DESC, review_id DESC
      LIMIT 1
    `,
  });

  const upsert: ThreadReviewSnapshotRepositoryShape["upsert"] = (row) =>
    upsertThreadReviewSnapshotRow(row).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "ThreadReviewSnapshotRepository.upsert:query",
          "ThreadReviewSnapshotRepository.upsert:encodeRequest",
        ),
      ),
    );

  const getByReviewId: ThreadReviewSnapshotRepositoryShape["getByReviewId"] = (input) =>
    getThreadReviewSnapshotRow(input).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "ThreadReviewSnapshotRepository.getByReviewId:query",
          "ThreadReviewSnapshotRepository.getByReviewId:decodeRow",
        ),
      ),
    );

  const listByThreadId: ThreadReviewSnapshotRepositoryShape["listByThreadId"] = (input) =>
    listThreadReviewSnapshotRows(input).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "ThreadReviewSnapshotRepository.listByThreadId:query",
          "ThreadReviewSnapshotRepository.listByThreadId:decodeRows",
        ),
      ),
    );

  const findReusable: ThreadReviewSnapshotRepositoryShape["findReusable"] = (input) =>
    findReusableThreadReviewSnapshotRow(input).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "ThreadReviewSnapshotRepository.findReusable:query",
          "ThreadReviewSnapshotRepository.findReusable:decodeRow",
        ),
      ),
    );

  return {
    upsert,
    getByReviewId,
    listByThreadId,
    findReusable,
  } satisfies ThreadReviewSnapshotRepositoryShape;
});

export const ThreadReviewSnapshotRepositoryLive = Layer.effect(
  ThreadReviewSnapshotRepository,
  makeThreadReviewSnapshotRepository,
);
