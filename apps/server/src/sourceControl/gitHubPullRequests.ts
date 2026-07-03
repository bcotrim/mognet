import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  PositiveInt,
  TrimmedNonEmptyString,
  type ChangeRequestChecksSummary,
  type ChangeRequestMergeStatus,
  type ChangeRequestReviewDecision,
} from "@t3tools/contracts";
import { decodeJsonResult, formatSchemaError } from "@t3tools/shared/schemaJson";

export interface NormalizedGitHubPullRequestRecord {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly baseRefName: string;
  readonly headRefName: string;
  readonly state: "open" | "closed" | "merged";
  readonly updatedAt: Option.Option<DateTime.Utc>;
  readonly isCrossRepository?: boolean;
  readonly headRepositoryNameWithOwner?: string | null;
  readonly headRepositoryOwnerLogin?: string | null;
  readonly isDraft?: boolean;
  readonly mergeStatus?: ChangeRequestMergeStatus;
  readonly reviewDecision?: ChangeRequestReviewDecision;
  readonly checks?: ChangeRequestChecksSummary;
}

const GitHubPullRequestSchema = Schema.Struct({
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  baseRefName: TrimmedNonEmptyString,
  headRefName: TrimmedNonEmptyString,
  state: Schema.optional(Schema.NullOr(Schema.String)),
  mergedAt: Schema.optional(Schema.NullOr(Schema.String)),
  updatedAt: Schema.optional(Schema.OptionFromNullOr(Schema.DateTimeUtcFromString)),
  isDraft: Schema.optional(Schema.Boolean),
  mergeStateStatus: Schema.optional(Schema.NullOr(Schema.String)),
  mergeable: Schema.optional(Schema.NullOr(Schema.String)),
  reviewDecision: Schema.optional(Schema.NullOr(Schema.String)),
  statusCheckRollup: Schema.optional(Schema.NullOr(Schema.Array(Schema.Unknown))),
  isCrossRepository: Schema.optional(Schema.Boolean),
  headRepository: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        nameWithOwner: Schema.String,
      }),
    ),
  ),
  headRepositoryOwner: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        login: Schema.String,
      }),
    ),
  ),
});

function trimOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeGitHubPullRequestState(input: {
  state?: string | null | undefined;
  mergedAt?: string | null | undefined;
}): "open" | "closed" | "merged" {
  const normalizedState = input.state?.trim().toUpperCase();
  if (
    (typeof input.mergedAt === "string" && input.mergedAt.trim().length > 0) ||
    normalizedState === "MERGED"
  ) {
    return "merged";
  }
  if (normalizedState === "CLOSED") {
    return "closed";
  }
  return "open";
}

function normalizeGitHubMergeStatus(input: {
  isDraft?: boolean | undefined;
  mergeStateStatus?: string | null | undefined;
  mergeable?: string | null | undefined;
}): ChangeRequestMergeStatus | undefined {
  if (input.isDraft) {
    return "draft";
  }

  switch (input.mergeStateStatus?.trim().toUpperCase()) {
    case "CLEAN":
      return "ready";
    case "DIRTY":
      return "conflicting";
    case "BLOCKED":
    case "HAS_HOOKS":
      return "blocked";
    case "BEHIND":
      return "behind";
    case "DRAFT":
      return "draft";
    case "UNSTABLE":
      return "unstable";
    case "UNKNOWN":
      return "unknown";
  }

  switch (input.mergeable?.trim().toUpperCase()) {
    case "MERGEABLE":
      return "ready";
    case "CONFLICTING":
      return "conflicting";
    case "UNKNOWN":
      return "unknown";
  }

  return undefined;
}

function normalizeGitHubReviewDecision(
  value: string | null | undefined,
): ChangeRequestReviewDecision | undefined {
  switch (value?.trim().toUpperCase()) {
    case "APPROVED":
      return "approved";
    case "CHANGES_REQUESTED":
      return "changes_requested";
    case "REVIEW_REQUIRED":
      return "review_required";
    case "UNKNOWN":
      return "unknown";
    default:
      return value ? "unknown" : undefined;
  }
}

function stringField(value: unknown, field: string): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const raw = (value as Record<string, unknown>)[field];
  return typeof raw === "string" ? raw.trim() : null;
}

function normalizeGitHubStatusCheckRollup(
  raw: ReadonlyArray<unknown> | null | undefined,
): ChangeRequestChecksSummary | undefined {
  if (!raw) {
    return undefined;
  }

  let failedCount = 0;
  let pendingCount = 0;
  let unknownCount = 0;

  for (const item of raw) {
    const conclusion = stringField(item, "conclusion")?.toUpperCase();
    if (conclusion) {
      switch (conclusion) {
        case "SUCCESS":
        case "NEUTRAL":
        case "SKIPPED":
          break;
        case "ACTION_REQUIRED":
        case "CANCELLED":
        case "FAILURE":
        case "STALE":
        case "STARTUP_FAILURE":
        case "TIMED_OUT":
          failedCount += 1;
          break;
        default:
          unknownCount += 1;
      }
      continue;
    }

    const state = stringField(item, "state")?.toUpperCase();
    if (state) {
      switch (state) {
        case "SUCCESS":
          break;
        case "ERROR":
        case "FAILURE":
          failedCount += 1;
          break;
        case "EXPECTED":
        case "PENDING":
          pendingCount += 1;
          break;
        default:
          unknownCount += 1;
      }
      continue;
    }

    const status = stringField(item, "status")?.toUpperCase();
    if (status) {
      if (status === "COMPLETED") {
        unknownCount += 1;
      } else {
        pendingCount += 1;
      }
      continue;
    }

    unknownCount += 1;
  }

  const totalCount = raw.length;
  return {
    status:
      failedCount > 0
        ? "failing"
        : pendingCount > 0
          ? "pending"
          : totalCount === 0
            ? "none"
            : unknownCount > 0
              ? "unknown"
              : "passing",
    totalCount,
    failedCount,
    pendingCount,
  };
}

function normalizeGitHubPullRequestRecord(
  raw: Schema.Schema.Type<typeof GitHubPullRequestSchema>,
): NormalizedGitHubPullRequestRecord {
  const headRepositoryNameWithOwner = trimOptionalString(raw.headRepository?.nameWithOwner);
  const headRepositoryOwnerLogin =
    trimOptionalString(raw.headRepositoryOwner?.login) ??
    (typeof headRepositoryNameWithOwner === "string" && headRepositoryNameWithOwner.includes("/")
      ? (headRepositoryNameWithOwner.split("/")[0] ?? null)
      : null);
  const mergeStatus = normalizeGitHubMergeStatus(raw);
  const reviewDecision = normalizeGitHubReviewDecision(raw.reviewDecision);
  const checks = normalizeGitHubStatusCheckRollup(raw.statusCheckRollup);

  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    baseRefName: raw.baseRefName,
    headRefName: raw.headRefName,
    state: normalizeGitHubPullRequestState(raw),
    updatedAt: raw.updatedAt ?? Option.none(),
    ...(typeof raw.isCrossRepository === "boolean"
      ? { isCrossRepository: raw.isCrossRepository }
      : {}),
    ...(headRepositoryNameWithOwner ? { headRepositoryNameWithOwner } : {}),
    ...(headRepositoryOwnerLogin ? { headRepositoryOwnerLogin } : {}),
    ...(raw.isDraft !== undefined ? { isDraft: raw.isDraft } : {}),
    ...(mergeStatus ? { mergeStatus } : {}),
    ...(reviewDecision ? { reviewDecision } : {}),
    ...(checks ? { checks } : {}),
  };
}

const decodeGitHubPullRequestList = decodeJsonResult(Schema.Array(Schema.Unknown));
const decodeGitHubPullRequest = decodeJsonResult(GitHubPullRequestSchema);
const decodeGitHubPullRequestEntry = Schema.decodeUnknownExit(GitHubPullRequestSchema);

export const formatGitHubJsonDecodeError = formatSchemaError;

export function decodeGitHubPullRequestListJson(
  raw: string,
): Result.Result<
  ReadonlyArray<NormalizedGitHubPullRequestRecord>,
  Cause.Cause<Schema.SchemaError>
> {
  const result = decodeGitHubPullRequestList(raw);
  if (Result.isSuccess(result)) {
    const pullRequests: NormalizedGitHubPullRequestRecord[] = [];
    for (const entry of result.success) {
      const decodedEntry = decodeGitHubPullRequestEntry(entry);
      if (Exit.isFailure(decodedEntry)) {
        continue;
      }
      pullRequests.push(normalizeGitHubPullRequestRecord(decodedEntry.value));
    }
    return Result.succeed(pullRequests);
  }
  return Result.fail(result.failure);
}

export function decodeGitHubPullRequestJson(
  raw: string,
): Result.Result<NormalizedGitHubPullRequestRecord, Cause.Cause<Schema.SchemaError>> {
  const result = decodeGitHubPullRequest(raw);
  if (Result.isSuccess(result)) {
    return Result.succeed(normalizeGitHubPullRequestRecord(result.success));
  }
  return Result.fail(result.failure);
}
