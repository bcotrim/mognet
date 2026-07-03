import {
  IsoDateTime,
  ReviewId,
  ReviewOpenOrigin,
  ReviewSnapshot,
  ReviewSnapshotErrorInfo,
  ReviewSnapshotStatus,
  ReviewSourceKind,
  ThreadId,
  TrimmedNonEmptyString,
  TurnId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ThreadReviewSnapshotRow = Schema.Struct({
  reviewId: ReviewId,
  threadId: ThreadId,
  turnId: Schema.NullOr(TurnId),
  origin: ReviewOpenOrigin,
  sourceKind: ReviewSourceKind,
  sourceId: TrimmedNonEmptyString,
  cwd: TrimmedNonEmptyString,
  baseRef: Schema.NullOr(TrimmedNonEmptyString),
  headRef: Schema.NullOr(TrimmedNonEmptyString),
  diffHash: TrimmedNonEmptyString,
  status: ReviewSnapshotStatus,
  snapshot: ReviewSnapshot,
  error: Schema.NullOr(ReviewSnapshotErrorInfo),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  completedAt: Schema.NullOr(IsoDateTime),
});
export type ThreadReviewSnapshotRow = typeof ThreadReviewSnapshotRow.Type;

export const GetThreadReviewSnapshotInput = Schema.Struct({
  reviewId: ReviewId,
});
export type GetThreadReviewSnapshotInput = typeof GetThreadReviewSnapshotInput.Type;

export const ListThreadReviewSnapshotsInput = Schema.Struct({
  threadId: ThreadId,
});
export type ListThreadReviewSnapshotsInput = typeof ListThreadReviewSnapshotsInput.Type;

export const FindReusableThreadReviewSnapshotInput = Schema.Struct({
  threadId: ThreadId,
  sourceKind: ReviewSourceKind,
  sourceId: TrimmedNonEmptyString,
  diffHash: TrimmedNonEmptyString,
});
export type FindReusableThreadReviewSnapshotInput =
  typeof FindReusableThreadReviewSnapshotInput.Type;

export interface ThreadReviewSnapshotRepositoryShape {
  readonly upsert: (row: ThreadReviewSnapshotRow) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getByReviewId: (
    input: GetThreadReviewSnapshotInput,
  ) => Effect.Effect<Option.Option<ThreadReviewSnapshotRow>, ProjectionRepositoryError>;
  readonly listByThreadId: (
    input: ListThreadReviewSnapshotsInput,
  ) => Effect.Effect<ReadonlyArray<ThreadReviewSnapshotRow>, ProjectionRepositoryError>;
  readonly findReusable: (
    input: FindReusableThreadReviewSnapshotInput,
  ) => Effect.Effect<Option.Option<ThreadReviewSnapshotRow>, ProjectionRepositoryError>;
}

export class ThreadReviewSnapshotRepository extends Context.Service<
  ThreadReviewSnapshotRepository,
  ThreadReviewSnapshotRepositoryShape
>()("t3/persistence/Services/ThreadReviewSnapshots/ThreadReviewSnapshotRepository") {}
