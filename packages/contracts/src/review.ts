import * as Schema from "effect/Schema";
import {
  IsoDateTime,
  NonNegativeInt,
  ThreadId,
  TrimmedNonEmptyString,
  TurnId,
} from "./baseSchemas.ts";
import { GitCommandError, TextGenerationError } from "./git.ts";
import { VcsError } from "./vcs.ts";

export const ReviewDiffPreviewInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  baseRef: Schema.optional(TrimmedNonEmptyString),
  ignoreWhitespace: Schema.optionalKey(Schema.Boolean),
});
export type ReviewDiffPreviewInput = typeof ReviewDiffPreviewInput.Type;

export const ReviewDiffPreviewSourceKind = Schema.Literals(["working-tree", "branch-range"]);
export type ReviewDiffPreviewSourceKind = typeof ReviewDiffPreviewSourceKind.Type;

export const ReviewDiffPreviewSource = Schema.Struct({
  id: TrimmedNonEmptyString,
  kind: ReviewDiffPreviewSourceKind,
  title: TrimmedNonEmptyString,
  baseRef: Schema.NullOr(TrimmedNonEmptyString),
  headRef: Schema.NullOr(TrimmedNonEmptyString),
  diff: Schema.String,
  diffHash: TrimmedNonEmptyString,
  truncated: Schema.Boolean,
});
export type ReviewDiffPreviewSource = typeof ReviewDiffPreviewSource.Type;

export const ReviewDiffPreviewResult = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  generatedAt: Schema.DateTimeUtc,
  sources: Schema.Array(ReviewDiffPreviewSource),
});
export type ReviewDiffPreviewResult = typeof ReviewDiffPreviewResult.Type;

export const ReviewDiffPreviewError = Schema.Union([VcsError, GitCommandError]);
export type ReviewDiffPreviewError = typeof ReviewDiffPreviewError.Type;

export const ReviewId = TrimmedNonEmptyString.pipe(Schema.brand("ReviewId"));
export type ReviewId = typeof ReviewId.Type;

export const ReviewSnapshotStatus = Schema.Literals(["pending", "ready", "failed"]);
export type ReviewSnapshotStatus = typeof ReviewSnapshotStatus.Type;

export const ReviewSnapshotFreshness = Schema.Literals(["fresh", "stale", "unknown"]);
export type ReviewSnapshotFreshness = typeof ReviewSnapshotFreshness.Type;

export const ReviewSourceKind = Schema.Literals(["working-tree", "branch-range", "turn"]);
export type ReviewSourceKind = typeof ReviewSourceKind.Type;

export const ReviewOpenOrigin = Schema.Literals(["manual", "provider"]);
export type ReviewOpenOrigin = typeof ReviewOpenOrigin.Type;

export const ReviewFindingSeverity = Schema.Literals(["critical", "major", "minor", "info"]);
export type ReviewFindingSeverity = typeof ReviewFindingSeverity.Type;

export const ReviewFindingAnchor = Schema.Struct({
  filePath: TrimmedNonEmptyString,
  startIndex: NonNegativeInt,
  endIndex: NonNegativeInt,
  rangeLabel: TrimmedNonEmptyString,
});
export type ReviewFindingAnchor = typeof ReviewFindingAnchor.Type;

export const ReviewFinding = Schema.Struct({
  id: TrimmedNonEmptyString,
  filePath: TrimmedNonEmptyString,
  severity: ReviewFindingSeverity,
  title: TrimmedNonEmptyString,
  body: TrimmedNonEmptyString,
  anchor: Schema.NullOr(ReviewFindingAnchor),
  suggestedFix: Schema.optional(TrimmedNonEmptyString),
  confidence: Schema.optional(Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
});
export type ReviewFinding = typeof ReviewFinding.Type;

export const ReviewFileContext = Schema.Struct({
  filePath: TrimmedNonEmptyString,
  changeKind: TrimmedNonEmptyString,
  additions: NonNegativeInt,
  deletions: NonNegativeInt,
  hunkCount: NonNegativeInt,
  truncated: Schema.Boolean,
  explanation: Schema.String,
  findings: Schema.Array(ReviewFinding),
});
export type ReviewFileContext = typeof ReviewFileContext.Type;

export const ReviewSnapshotSource = Schema.Struct({
  id: TrimmedNonEmptyString,
  kind: ReviewSourceKind,
  title: TrimmedNonEmptyString,
  baseRef: Schema.NullOr(TrimmedNonEmptyString),
  headRef: Schema.NullOr(TrimmedNonEmptyString),
  turnId: Schema.NullOr(TurnId),
  fromTurnCount: Schema.NullOr(NonNegativeInt),
  toTurnCount: Schema.NullOr(NonNegativeInt),
});
export type ReviewSnapshotSource = typeof ReviewSnapshotSource.Type;

export const ReviewSnapshotErrorInfo = Schema.Struct({
  message: TrimmedNonEmptyString,
});
export type ReviewSnapshotErrorInfo = typeof ReviewSnapshotErrorInfo.Type;

export const ReviewSnapshot = Schema.Struct({
  reviewId: ReviewId,
  threadId: ThreadId,
  turnId: Schema.NullOr(TurnId),
  origin: ReviewOpenOrigin,
  status: ReviewSnapshotStatus,
  freshness: ReviewSnapshotFreshness,
  cwd: TrimmedNonEmptyString,
  source: ReviewSnapshotSource,
  diffHash: TrimmedNonEmptyString,
  diff: Schema.String,
  diffTruncated: Schema.Boolean,
  summary: Schema.String,
  files: Schema.Array(ReviewFileContext),
  error: Schema.NullOr(ReviewSnapshotErrorInfo),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  completedAt: Schema.NullOr(IsoDateTime),
});
export type ReviewSnapshot = typeof ReviewSnapshot.Type;

export const ReviewOpenSnapshotSourceKind = Schema.Literals([
  "smart",
  "working-tree",
  "branch-range",
  "turn",
]);
export type ReviewOpenSnapshotSourceKind = typeof ReviewOpenSnapshotSourceKind.Type;

export const ReviewOpenSnapshotSource = Schema.Struct({
  kind: ReviewOpenSnapshotSourceKind,
  baseRef: Schema.optional(TrimmedNonEmptyString),
  turnId: Schema.optional(TurnId),
  fromTurnCount: Schema.optional(NonNegativeInt),
  toTurnCount: Schema.optional(NonNegativeInt),
  title: Schema.optional(TrimmedNonEmptyString),
});
export type ReviewOpenSnapshotSource = typeof ReviewOpenSnapshotSource.Type;

export const ReviewOpenSnapshotInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  threadId: ThreadId,
  origin: ReviewOpenOrigin,
  source: Schema.optional(ReviewOpenSnapshotSource),
  ignoreWhitespace: Schema.optionalKey(Schema.Boolean),
});
export type ReviewOpenSnapshotInput = typeof ReviewOpenSnapshotInput.Type;

export const ReviewGetSnapshotInput = Schema.Struct({
  reviewId: ReviewId,
});
export type ReviewGetSnapshotInput = typeof ReviewGetSnapshotInput.Type;

export const ReviewListSnapshotsInput = Schema.Struct({
  threadId: ThreadId,
});
export type ReviewListSnapshotsInput = typeof ReviewListSnapshotsInput.Type;

export const ReviewListSnapshotsResult = Schema.Struct({
  snapshots: Schema.Array(ReviewSnapshot),
});
export type ReviewListSnapshotsResult = typeof ReviewListSnapshotsResult.Type;

export const ReviewRefreshSnapshotInput = Schema.Struct({
  reviewId: ReviewId,
});
export type ReviewRefreshSnapshotInput = typeof ReviewRefreshSnapshotInput.Type;

export class ReviewSnapshotError extends Schema.TaggedErrorClass<ReviewSnapshotError>()(
  "ReviewSnapshotError",
  {
    operation: Schema.String,
    detail: TrimmedNonEmptyString,
    reviewId: Schema.optional(ReviewId),
    threadId: Schema.optional(ThreadId),
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Review snapshot failed in ${this.operation}: ${this.detail}`;
  }
}

export const ReviewSnapshotRpcError = Schema.Union([
  ReviewSnapshotError,
  ReviewDiffPreviewError,
  TextGenerationError,
]);
export type ReviewSnapshotRpcError = typeof ReviewSnapshotRpcError.Type;
