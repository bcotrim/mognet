import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { parsePatchFiles } from "@pierre/diffs/utils/parsePatchFiles";
import type { FileDiffMetadata } from "@pierre/diffs/types";

import {
  ReviewFindingSeverity,
  ReviewId,
  VcsRepositoryDetectionError,
  VcsUnsupportedOperationError,
  type ReviewFileContext,
  type ReviewDiffPreviewError,
  type ReviewDiffPreviewInput,
  type ReviewDiffPreviewResult,
  type ReviewDiffPreviewSource,
  type ReviewFinding,
  type ReviewFindingAnchor,
  type ReviewGetSnapshotInput,
  type ReviewListSnapshotsInput,
  type ReviewListSnapshotsResult,
  type ReviewOpenSnapshotInput,
  type ReviewOpenSnapshotSource,
  type ReviewRefreshSnapshotInput,
  type ReviewSnapshot,
  ReviewSnapshotError,
  type ReviewSnapshotErrorInfo,
  type ReviewSnapshotRpcError,
  type ReviewSnapshotSource,
  type ReviewSourceKind,
} from "@t3tools/contracts";

import * as CheckpointDiffQuery from "../checkpointing/CheckpointDiffQuery.ts";
import * as ServerConfig from "../config.ts";
import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as ThreadReviewSnapshots from "../persistence/Services/ThreadReviewSnapshots.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as TextGeneration from "../textGeneration/TextGeneration.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import * as VcsDriverRegistry from "../vcs/VcsDriverRegistry.ts";

interface DiffReviewLine {
  readonly change: "context" | "add" | "delete";
  readonly oldLineNumber: number | null;
  readonly newLineNumber: number | null;
  readonly content: string;
}

interface ParsedReviewFileContext {
  readonly fileContext: ReviewFileContext;
  readonly generationContext: TextGeneration.ReviewSnapshotFileContextInput;
}

interface ResolvedReviewSource {
  readonly cwd: string;
  readonly threadId: ReviewOpenSnapshotInput["threadId"];
  readonly turnId: ReviewSnapshot["turnId"];
  readonly origin: ReviewOpenSnapshotInput["origin"];
  readonly source: ReviewSnapshotSource;
  readonly diff: string;
  readonly diffHash: string;
  readonly diffTruncated: boolean;
}

export class ReviewService extends Context.Service<
  ReviewService,
  {
    readonly getDiffPreview: (
      input: ReviewDiffPreviewInput,
    ) => Effect.Effect<ReviewDiffPreviewResult, ReviewDiffPreviewError>;
    readonly openSnapshot: (
      input: ReviewOpenSnapshotInput,
    ) => Effect.Effect<ReviewSnapshot, ReviewSnapshotRpcError>;
    readonly getSnapshot: (
      input: ReviewGetSnapshotInput,
    ) => Effect.Effect<ReviewSnapshot, ReviewSnapshotRpcError>;
    readonly listSnapshots: (
      input: ReviewListSnapshotsInput,
    ) => Effect.Effect<ReviewListSnapshotsResult, ReviewSnapshotRpcError>;
    readonly refreshSnapshot: (
      input: ReviewRefreshSnapshotInput,
    ) => Effect.Effect<ReviewSnapshot, ReviewSnapshotRpcError>;
  }
>()("t3/review/ReviewService") {}

const nowIso = Effect.map(DateTime.now, DateTime.formatIso);
const isReviewFindingSeverity = Schema.is(ReviewFindingSeverity);

function nonEmptyDetail(value: unknown, fallback: string): string {
  const text =
    value instanceof Error
      ? value.message
      : typeof value === "string"
        ? value
        : typeof value === "object" && value !== null && "message" in value
          ? String((value as { readonly message?: unknown }).message ?? "")
          : "";
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function stripDiffPathPrefix(value: string): string {
  if (value === "/dev/null") return value;
  return value.startsWith("a/") || value.startsWith("b/") ? value.slice(2) : value;
}

function resolveFileDiffPath(fileDiff: FileDiffMetadata): string {
  const raw = fileDiff.name ?? fileDiff.prevName ?? "";
  return stripDiffPathPrefix(raw);
}

function stripTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value.slice(0, -1) : value;
}

function buildDiffReviewLines(fileDiff: FileDiffMetadata): ReadonlyArray<DiffReviewLine> {
  const rows: DiffReviewLine[] = [];

  for (const hunk of fileDiff.hunks) {
    let oldLineNumber = hunk.deletionStart;
    let newLineNumber = hunk.additionStart;
    let deletionLineIndex = hunk.deletionLineIndex;
    let additionLineIndex = hunk.additionLineIndex;

    for (const segment of hunk.hunkContent) {
      if (segment.type === "context") {
        for (let index = 0; index < segment.lines; index += 1) {
          rows.push({
            change: "context",
            oldLineNumber,
            newLineNumber,
            content: stripTrailingNewline(
              fileDiff.additionLines[additionLineIndex] ??
                fileDiff.deletionLines[deletionLineIndex] ??
                "",
            ),
          });
          oldLineNumber += 1;
          newLineNumber += 1;
          deletionLineIndex += 1;
          additionLineIndex += 1;
        }
        continue;
      }

      for (let index = 0; index < segment.deletions; index += 1) {
        rows.push({
          change: "delete",
          oldLineNumber,
          newLineNumber: null,
          content: stripTrailingNewline(fileDiff.deletionLines[deletionLineIndex] ?? ""),
        });
        oldLineNumber += 1;
        deletionLineIndex += 1;
      }

      for (let index = 0; index < segment.additions; index += 1) {
        rows.push({
          change: "add",
          oldLineNumber: null,
          newLineNumber,
          content: stripTrailingNewline(fileDiff.additionLines[additionLineIndex] ?? ""),
        });
        newLineNumber += 1;
        additionLineIndex += 1;
      }
    }
  }

  return rows;
}

function getDiffRange(
  lines: ReadonlyArray<DiffReviewLine>,
  key: "oldLineNumber" | "newLineNumber",
): { start: number; count: number } {
  const numberedLines = lines.filter((line) => line[key] !== null);
  return {
    start: numberedLines[0]?.[key] ?? 0,
    count: numberedLines.length,
  };
}

function getDiffChangeMarker(change: DiffReviewLine["change"]): string {
  if (change === "add") return "+";
  if (change === "delete") return "-";
  return " ";
}

function formatDiffReviewRangeLabel(lines: ReadonlyArray<DiffReviewLine>): string {
  const firstLine = lines[0];
  const lastLine = lines.at(-1);
  if (!firstLine || !lastLine) return "line";
  const firstNumber = firstLine.newLineNumber ?? firstLine.oldLineNumber;
  const lastNumber = lastLine.newLineNumber ?? lastLine.oldLineNumber;
  if (firstNumber === null || lastNumber === null) {
    return lines.length === 1 ? "line" : `${lines.length} lines`;
  }

  const firstMarker = getDiffChangeMarker(firstLine.change).trim();
  const marker =
    firstMarker.length > 0 && lines.every((line) => line.change === firstLine.change)
      ? firstMarker
      : "";
  return firstNumber === lastNumber
    ? `${marker}${firstNumber}`
    : `${marker}${firstNumber} to ${marker}${lastNumber}`;
}

function formatDiffSnippet(lines: ReadonlyArray<DiffReviewLine>): string {
  const oldRange = getDiffRange(lines, "oldLineNumber");
  const newRange = getDiffRange(lines, "newLineNumber");
  return [
    `@@ -${oldRange.start},${oldRange.count} +${newRange.start},${newRange.count} @@`,
    ...lines.map((line) => `${getDiffChangeMarker(line.change)}${line.content}`),
  ].join("\n");
}

function summarizeFileDiffStats(fileDiff: FileDiffMetadata): {
  readonly additions: number;
  readonly deletions: number;
  readonly hunkCount: number;
} {
  return fileDiff.hunks.reduce(
    (stat, hunk) => ({
      additions: stat.additions + hunk.additionLines,
      deletions: stat.deletions + hunk.deletionLines,
      hunkCount: stat.hunkCount + 1,
    }),
    { additions: 0, deletions: 0, hunkCount: 0 },
  );
}

function buildAnchorContexts(
  filePath: string,
  fileIndex: number,
  lines: ReadonlyArray<DiffReviewLine>,
): ReadonlyArray<TextGeneration.ReviewSnapshotAnchorContext> {
  const anchors: TextGeneration.ReviewSnapshotAnchorContext[] = [];
  let cursor = 0;

  while (cursor < lines.length) {
    if (lines[cursor]?.change === "context") {
      cursor += 1;
      continue;
    }

    const startIndex = cursor;
    let endIndex = cursor;
    while (endIndex + 1 < lines.length && lines[endIndex + 1]?.change !== "context") {
      endIndex += 1;
    }

    for (let groupStart = startIndex; groupStart <= endIndex; groupStart += 12) {
      const groupEnd = Math.min(endIndex, groupStart + 11);
      const selectedLines = lines.slice(groupStart, groupEnd + 1);
      anchors.push({
        id: `anchor:${fileIndex}:${groupStart}:${groupEnd}`,
        filePath,
        startIndex: groupStart,
        endIndex: groupEnd,
        rangeLabel: formatDiffReviewRangeLabel(selectedLines),
        diff: formatDiffSnippet(selectedLines),
      });
    }

    cursor = endIndex + 1;
  }

  return anchors;
}

function buildDeterministicReviewContext(
  diff: string,
  truncated: boolean,
): ReadonlyArray<ParsedReviewFileContext> {
  const normalizedDiff = diff.replace(/\r\n/g, "\n").trim();
  if (normalizedDiff.length === 0) {
    return [];
  }

  try {
    const parsedPatches = parsePatchFiles(normalizedDiff);
    const files = parsedPatches.flatMap((patch) => patch.files);
    return files.map((fileDiff, fileIndex) => {
      const filePath = resolveFileDiffPath(fileDiff);
      const stats = summarizeFileDiffStats(fileDiff);
      const lines = buildDiffReviewLines(fileDiff);
      const anchors = buildAnchorContexts(filePath, fileIndex, lines);
      const changeKind = String(fileDiff.type ?? "modified");
      const explanation =
        stats.hunkCount === 0
          ? "Metadata-only change."
          : `${stats.additions} additions and ${stats.deletions} deletions across ${stats.hunkCount} hunks.`;
      const fileContext: ReviewFileContext = {
        filePath,
        changeKind,
        additions: stats.additions,
        deletions: stats.deletions,
        hunkCount: stats.hunkCount,
        truncated,
        explanation,
        findings: [],
      };
      return {
        fileContext,
        generationContext: {
          filePath,
          changeKind,
          additions: stats.additions,
          deletions: stats.deletions,
          hunkCount: stats.hunkCount,
          truncated,
          anchors,
        },
      };
    });
  } catch {
    return [];
  }
}

function makeSourceFromPreview(source: ReviewDiffPreviewSource): ReviewSnapshotSource {
  return {
    id: source.id,
    kind: source.kind,
    title: source.title,
    baseRef: source.baseRef,
    headRef: source.headRef,
    turnId: null,
    fromTurnCount: null,
    toTurnCount: null,
  };
}

function makeErrorInfo(cause: unknown): ReviewSnapshotErrorInfo {
  return {
    message: nonEmptyDetail(cause, "Review generation failed."),
  };
}

export const make = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const vcsRegistry = yield* VcsDriverRegistry.VcsDriverRegistry;
  const git = yield* GitVcsDriver.GitVcsDriver;
  const checkpointDiffQuery = yield* CheckpointDiffQuery.CheckpointDiffQuery;
  const projectionSnapshotQuery = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;
  const snapshotRepository = yield* ThreadReviewSnapshots.ThreadReviewSnapshotRepository;
  const serverSettingsService = yield* ServerSettings.ServerSettingsService;
  const textGeneration = yield* TextGeneration.TextGeneration;
  const crypto = yield* Crypto.Crypto;

  const canonicalizePath = (value: string) => {
    const resolvedPath = path.resolve(value);
    return fileSystem.realPath(resolvedPath).pipe(
      Effect.catchTags({
        PlatformError: (cause) =>
          cause.reason._tag === "NotFound"
            ? Effect.succeed(resolvedPath)
            : Effect.fail(
                new VcsRepositoryDetectionError({
                  operation: "ReviewService.assertWorkspaceBoundCwd.canonicalizePath",
                  cwd: resolvedPath,
                  detail: "Failed to resolve a path while validating the review workspace.",
                  cause,
                }),
              ),
      }),
    );
  };

  const isWithinRoot = (candidate: string, root: string) => {
    const relative = path.relative(root, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  };

  const assertWorkspaceBoundCwd = Effect.fn("ReviewService.assertWorkspaceBoundCwd")(function* (
    cwd: string,
  ) {
    const [candidate, workspaceRoot, worktreesRoot] = yield* Effect.all([
      canonicalizePath(cwd),
      canonicalizePath(config.cwd),
      canonicalizePath(config.worktreesDir),
    ]);

    if (isWithinRoot(candidate, workspaceRoot) || isWithinRoot(candidate, worktreesRoot)) {
      return;
    }

    return yield* new VcsRepositoryDetectionError({
      operation: "ReviewService.getDiffPreview",
      cwd,
      detail: "Review diff preview cwd must stay within the configured workspace root.",
    });
  });

  const getDiffPreview: ReviewService["Service"]["getDiffPreview"] = Effect.fn(
    "ReviewService.getDiffPreview",
  )(function* (input) {
    yield* assertWorkspaceBoundCwd(input.cwd);

    const handle = yield* vcsRegistry.detect({ cwd: input.cwd, requestedKind: "auto" });
    if (!handle) {
      return {
        cwd: input.cwd,
        generatedAt: yield* DateTime.now,
        sources: [],
      };
    }

    const getDriverDiffPreview = handle.driver.getDiffPreview;
    if (!getDriverDiffPreview) {
      if (handle.kind === "git") {
        return yield* git.getReviewDiffPreview(input);
      }
      return yield* new VcsUnsupportedOperationError({
        operation: "ReviewService.getDiffPreview",
        kind: handle.kind,
        detail: `The ${handle.kind} VCS driver does not support review diff previews.`,
      });
    }

    return yield* getDriverDiffPreview(input);
  });

  const reviewError = (
    operation: string,
    detail: string,
    extras: Partial<Pick<ReviewSnapshotError, "reviewId" | "threadId" | "cause">> = {},
  ) =>
    new ReviewSnapshotError({
      operation,
      detail: nonEmptyDetail(detail, "Review snapshot operation failed."),
      ...extras,
    });

  const hashDiff = (operation: string, cwd: string, diff: string) =>
    crypto.digest("SHA-256", new TextEncoder().encode(diff)).pipe(
      Effect.map(Encoding.encodeHex),
      Effect.mapError((cause) => reviewError(operation, "Failed to hash review diff.", { cause })),
    );

  const randomReviewId = () =>
    crypto.randomUUIDv4.pipe(
      Effect.map((uuid) => ReviewId.make(`review:${uuid}`)),
      Effect.mapError((cause) =>
        reviewError("ReviewService.randomReviewId", "Failed to generate review id.", {
          cause,
        }),
      ),
    );

  const resolveTextGenerationModelSelection = (cwd: string) =>
    Effect.gen(function* () {
      const settings = yield* serverSettingsService.getSettings;
      const project = yield* projectionSnapshotQuery
        .getActiveProjectByWorkspaceRoot(cwd)
        .pipe(Effect.map(Option.getOrUndefined));
      return project?.textGenerationModelSelection ?? settings.textGenerationModelSelection;
    }).pipe(
      Effect.mapError((cause) =>
        reviewError(
          "ReviewService.resolveTextGenerationModelSelection",
          "Failed to resolve text generation settings.",
          { cause },
        ),
      ),
    );

  const getPreviewSource = Effect.fn("ReviewService.getPreviewSource")(function* (
    input: ReviewOpenSnapshotInput,
    requestedSource: ReviewOpenSnapshotSource,
  ) {
    const preview = yield* getDiffPreview({
      cwd: input.cwd,
      ...(requestedSource.baseRef === undefined ? {} : { baseRef: requestedSource.baseRef }),
      ...(input.ignoreWhitespace === undefined ? {} : { ignoreWhitespace: input.ignoreWhitespace }),
    }).pipe(
      Effect.mapError((cause) =>
        reviewError("ReviewService.getPreviewSource", "Failed to load review diff source.", {
          threadId: input.threadId,
          cause,
        }),
      ),
    );

    const workingTree = preview.sources.find((source) => source.kind === "working-tree");
    const branchRange = preview.sources.find((source) => source.kind === "branch-range");
    if (requestedSource.kind === "working-tree") {
      if (workingTree) return workingTree;
      return yield* reviewError(
        "ReviewService.getPreviewSource",
        "Working tree diff is unavailable.",
        {
          threadId: input.threadId,
        },
      );
    }
    if (requestedSource.kind === "branch-range") {
      if (branchRange) return branchRange;
      return yield* reviewError(
        "ReviewService.getPreviewSource",
        "Branch range diff is unavailable.",
        {
          threadId: input.threadId,
        },
      );
    }

    const smartSource =
      branchRange && branchRange.diff.trim().length > 0
        ? branchRange
        : (workingTree ?? branchRange);
    if (smartSource) return smartSource;

    return yield* reviewError(
      "ReviewService.getPreviewSource",
      "No review diff source is available.",
      {
        threadId: input.threadId,
      },
    );
  });

  const resolveReviewSource = Effect.fn("ReviewService.resolveReviewSource")(function* (
    input: ReviewOpenSnapshotInput,
  ) {
    yield* assertWorkspaceBoundCwd(input.cwd).pipe(
      Effect.mapError((cause) =>
        reviewError("ReviewService.resolveReviewSource", "Invalid review workspace.", {
          threadId: input.threadId,
          cause,
        }),
      ),
    );

    const requestedSource: ReviewOpenSnapshotSource = input.source ?? { kind: "smart" };
    if (requestedSource.kind === "turn") {
      const toTurnCount = requestedSource.toTurnCount;
      if (toTurnCount === undefined) {
        return yield* reviewError(
          "ReviewService.resolveReviewSource",
          "Turn review source requires toTurnCount.",
          { threadId: input.threadId },
        );
      }
      const fromTurnCount = requestedSource.fromTurnCount ?? Math.max(0, toTurnCount - 1);
      const turnDiff =
        fromTurnCount === 0
          ? yield* checkpointDiffQuery
              .getFullThreadDiff({
                threadId: input.threadId,
                toTurnCount,
                ...(input.ignoreWhitespace === undefined
                  ? {}
                  : { ignoreWhitespace: input.ignoreWhitespace }),
              })
              .pipe(
                Effect.mapError((cause) =>
                  reviewError(
                    "ReviewService.resolveReviewSource.turnDiff",
                    "Failed to load turn review diff.",
                    { threadId: input.threadId, cause },
                  ),
                ),
              )
          : yield* checkpointDiffQuery
              .getTurnDiff({
                threadId: input.threadId,
                fromTurnCount,
                toTurnCount,
                ...(input.ignoreWhitespace === undefined
                  ? {}
                  : { ignoreWhitespace: input.ignoreWhitespace }),
              })
              .pipe(
                Effect.mapError((cause) =>
                  reviewError(
                    "ReviewService.resolveReviewSource.turnDiff",
                    "Failed to load turn review diff.",
                    { threadId: input.threadId, cause },
                  ),
                ),
              );
      const diffHash = yield* hashDiff(
        "ReviewService.resolveReviewSource.turnHash",
        input.cwd,
        turnDiff.diff,
      );
      const source: ReviewSnapshotSource = {
        id: `turn:${fromTurnCount}:${toTurnCount}`,
        kind: "turn",
        title:
          requestedSource.title ??
          (fromTurnCount === 0
            ? `Thread changes through turn ${toTurnCount}`
            : `Turn ${toTurnCount} changes`),
        baseRef: null,
        headRef: null,
        turnId: requestedSource.turnId ?? null,
        fromTurnCount,
        toTurnCount,
      };
      return {
        cwd: input.cwd,
        threadId: input.threadId,
        turnId: requestedSource.turnId ?? null,
        origin: input.origin,
        source,
        diff: turnDiff.diff,
        diffHash,
        diffTruncated: false,
      } satisfies ResolvedReviewSource;
    }

    const previewSource = yield* getPreviewSource(input, requestedSource);
    return {
      cwd: input.cwd,
      threadId: input.threadId,
      turnId: null,
      origin: input.origin,
      source: makeSourceFromPreview(previewSource),
      diff: previewSource.diff,
      diffHash: previewSource.diffHash,
      diffTruncated: previewSource.truncated,
    } satisfies ResolvedReviewSource;
  });

  const persistSnapshot = (snapshot: ReviewSnapshot) =>
    snapshotRepository
      .upsert({
        reviewId: snapshot.reviewId,
        threadId: snapshot.threadId,
        turnId: snapshot.turnId,
        origin: snapshot.origin,
        sourceKind: snapshot.source.kind,
        sourceId: snapshot.source.id,
        cwd: snapshot.cwd,
        baseRef: snapshot.source.baseRef,
        headRef: snapshot.source.headRef,
        diffHash: snapshot.diffHash,
        status: snapshot.status,
        snapshot,
        error: snapshot.error,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
        completedAt: snapshot.completedAt,
      })
      .pipe(
        Effect.mapError((cause) =>
          reviewError("ReviewService.persistSnapshot", "Failed to persist review snapshot.", {
            reviewId: snapshot.reviewId,
            threadId: snapshot.threadId,
            cause,
          }),
        ),
      );

  const makePendingSnapshot = Effect.fn("ReviewService.makePendingSnapshot")(function* (
    resolved: ResolvedReviewSource,
  ) {
    const reviewId = yield* randomReviewId();
    const createdAt = yield* nowIso;
    const deterministicContext = buildDeterministicReviewContext(
      resolved.diff,
      resolved.diffTruncated,
    );
    const emptyDiff = resolved.diff.trim().length === 0;
    const snapshot: ReviewSnapshot = {
      reviewId,
      threadId: resolved.threadId,
      turnId: resolved.turnId,
      origin: resolved.origin,
      status: emptyDiff ? "ready" : "pending",
      freshness: "fresh",
      cwd: resolved.cwd,
      source: resolved.source,
      diffHash: resolved.diffHash,
      diff: resolved.diff,
      diffTruncated: resolved.diffTruncated,
      summary: emptyDiff ? "No changes to review." : "",
      files: deterministicContext.map((context) => context.fileContext),
      error: null,
      createdAt,
      updatedAt: createdAt,
      completedAt: emptyDiff ? createdAt : null,
    };
    return { snapshot, deterministicContext };
  });

  const sanitizeGeneratedReview = (
    reviewId: ReviewId,
    deterministicContext: ReadonlyArray<ParsedReviewFileContext>,
    generated: TextGeneration.ReviewSnapshotGenerationResult,
  ): Pick<ReviewSnapshot, "summary" | "files"> => {
    const generatedFileByPath = new Map(generated.files.map((file) => [file.filePath, file]));
    const filePathSet = new Set(
      deterministicContext.map((context) => context.fileContext.filePath),
    );
    const anchorById = new Map<string, ReviewFindingAnchor>();
    for (const context of deterministicContext) {
      for (const anchor of context.generationContext.anchors) {
        anchorById.set(anchor.id, {
          filePath: anchor.filePath,
          startIndex: anchor.startIndex,
          endIndex: anchor.endIndex,
          rangeLabel: anchor.rangeLabel,
        });
      }
    }

    let findingIndex = 0;
    const files = deterministicContext.map(({ fileContext }) => {
      const generatedFile = generatedFileByPath.get(fileContext.filePath);
      const findings: ReviewFinding[] = [];
      for (const finding of generatedFile?.findings ?? []) {
        const filePath = finding.filePath.trim();
        if (!filePathSet.has(filePath)) continue;
        const title = finding.title.trim();
        const body = finding.body.trim();
        if (title.length === 0 || body.length === 0 || !isReviewFindingSeverity(finding.severity)) {
          continue;
        }
        const anchor =
          finding.anchorId === undefined
            ? null
            : ((anchorById.get(finding.anchorId)?.filePath === filePath
                ? anchorById.get(finding.anchorId)
                : null) ?? null);
        findingIndex += 1;
        findings.push({
          id: `${reviewId}:finding:${findingIndex}`,
          filePath,
          severity: finding.severity,
          title,
          body,
          anchor,
          ...(finding.suggestedFix?.trim() ? { suggestedFix: finding.suggestedFix.trim() } : {}),
          ...(typeof finding.confidence === "number" &&
          Number.isFinite(finding.confidence) &&
          finding.confidence >= 0 &&
          finding.confidence <= 1
            ? { confidence: finding.confidence }
            : {}),
        });
      }

      const explanation = generatedFile?.explanation.trim() || fileContext.explanation;
      return {
        ...fileContext,
        explanation,
        findings,
      };
    });

    return {
      summary: generated.summary.trim() || "Review complete.",
      files,
    };
  };

  const markSnapshotFailed = (
    snapshot: ReviewSnapshot,
    cause: unknown,
  ): Effect.Effect<ReviewSnapshot, ReviewSnapshotError> =>
    Effect.gen(function* () {
      const completedAt = yield* nowIso;
      const error = makeErrorInfo(cause);
      const failedSnapshot: ReviewSnapshot = {
        ...snapshot,
        status: "failed",
        error,
        updatedAt: completedAt,
        completedAt,
      };
      yield* persistSnapshot(failedSnapshot);
      return failedSnapshot;
    });

  const generateSnapshot = Effect.fn("ReviewService.generateSnapshot")(function* (
    snapshot: ReviewSnapshot,
    deterministicContext: ReadonlyArray<ParsedReviewFileContext>,
  ) {
    if (snapshot.status === "ready") return snapshot;
    const modelSelection = yield* resolveTextGenerationModelSelection(snapshot.cwd);
    const generated = yield* textGeneration.generateReviewSnapshot({
      cwd: snapshot.cwd,
      sourceTitle: snapshot.source.title,
      diff: snapshot.diff,
      fileContexts: deterministicContext.map((context) => context.generationContext),
      modelSelection,
      originThreadId: snapshot.threadId,
      ...(snapshot.turnId === null ? {} : { originTurnId: snapshot.turnId }),
    });
    const completedAt = yield* nowIso;
    const sanitized = sanitizeGeneratedReview(snapshot.reviewId, deterministicContext, generated);
    const readySnapshot: ReviewSnapshot = {
      ...snapshot,
      status: "ready",
      summary: sanitized.summary,
      files: sanitized.files,
      error: null,
      updatedAt: completedAt,
      completedAt,
    };
    yield* persistSnapshot(readySnapshot);
    return readySnapshot;
  });

  const openSnapshotInternal = Effect.fn("ReviewService.openSnapshotInternal")(function* (
    input: ReviewOpenSnapshotInput,
    refresh: boolean,
  ) {
    const resolved = yield* resolveReviewSource(input);
    if (!refresh) {
      const reusable = yield* snapshotRepository
        .findReusable({
          threadId: resolved.threadId,
          sourceKind: resolved.source.kind,
          sourceId: resolved.source.id,
          diffHash: resolved.diffHash,
        })
        .pipe(
          Effect.mapError((cause) =>
            reviewError(
              "ReviewService.openSnapshot.findReusable",
              "Failed to load review snapshot.",
              {
                threadId: resolved.threadId,
                cause,
              },
            ),
          ),
        );
      if (Option.isSome(reusable)) {
        return reusable.value.snapshot;
      }
    }

    const { snapshot, deterministicContext } = yield* makePendingSnapshot(resolved);
    yield* persistSnapshot(snapshot);

    if (snapshot.status === "pending") {
      yield* generateSnapshot(snapshot, deterministicContext).pipe(
        Effect.catch((cause) => markSnapshotFailed(snapshot, cause)),
        Effect.ignoreCause({ log: true }),
        Effect.forkDetach,
        Effect.asVoid,
      );
    }

    return snapshot;
  });

  const computeSnapshotFreshness = (snapshot: ReviewSnapshot) =>
    Effect.gen(function* () {
      if (snapshot.source.kind === "turn") return "fresh" as const;
      const preview = yield* getDiffPreview({
        cwd: snapshot.cwd,
        ...(snapshot.source.baseRef === null ? {} : { baseRef: snapshot.source.baseRef }),
      });
      const currentSource = preview.sources.find((source) => source.kind === snapshot.source.kind);
      if (!currentSource) return "unknown" as const;
      return currentSource.diffHash === snapshot.diffHash ? ("fresh" as const) : ("stale" as const);
    }).pipe(Effect.catch(() => Effect.succeed("unknown" as const)));

  const getSnapshot: ReviewService["Service"]["getSnapshot"] = Effect.fn(
    "ReviewService.getSnapshot",
  )(function* (input) {
    const row = yield* snapshotRepository.getByReviewId(input).pipe(
      Effect.mapError((cause) =>
        reviewError("ReviewService.getSnapshot", "Failed to load review snapshot.", {
          reviewId: input.reviewId,
          cause,
        }),
      ),
    );
    if (Option.isNone(row)) {
      return yield* reviewError("ReviewService.getSnapshot", "Review snapshot was not found.", {
        reviewId: input.reviewId,
      });
    }
    const freshness = yield* computeSnapshotFreshness(row.value.snapshot);
    return {
      ...row.value.snapshot,
      freshness,
    };
  });

  const openSnapshot: ReviewService["Service"]["openSnapshot"] = Effect.fn(
    "ReviewService.openSnapshot",
  )((input) => openSnapshotInternal(input, false));

  const listSnapshots: ReviewService["Service"]["listSnapshots"] = Effect.fn(
    "ReviewService.listSnapshots",
  )(function* (input) {
    const rows = yield* snapshotRepository.listByThreadId(input).pipe(
      Effect.mapError((cause) =>
        reviewError("ReviewService.listSnapshots", "Failed to list review snapshots.", {
          threadId: input.threadId,
          cause,
        }),
      ),
    );
    return { snapshots: rows.map((row) => row.snapshot) };
  });

  const refreshSnapshot: ReviewService["Service"]["refreshSnapshot"] = Effect.fn(
    "ReviewService.refreshSnapshot",
  )(function* (input) {
    const current = yield* getSnapshot(input);
    const sourceKind = current.source.kind satisfies ReviewSourceKind;
    return yield* openSnapshotInternal(
      {
        cwd: current.cwd,
        threadId: current.threadId,
        origin: current.origin,
        source: {
          kind: sourceKind,
          ...(current.source.baseRef === null ? {} : { baseRef: current.source.baseRef }),
          ...(current.source.turnId === null ? {} : { turnId: current.source.turnId }),
          ...(current.source.fromTurnCount === null
            ? {}
            : { fromTurnCount: current.source.fromTurnCount }),
          ...(current.source.toTurnCount === null
            ? {}
            : { toTurnCount: current.source.toTurnCount }),
          title: current.source.title,
        },
      },
      true,
    );
  });

  return ReviewService.of({
    getDiffPreview,
    openSnapshot,
    getSnapshot,
    listSnapshots,
    refreshSnapshot,
  });
});

export const layer = Layer.effect(ReviewService, make);
