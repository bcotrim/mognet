import type {
  AnnotationSide,
  CodeViewDiffItem,
  CodeViewItem,
  DiffLineAnnotation,
  FileDiffMetadata,
  SelectedLineRange,
} from "@pierre/diffs";
import { CodeView, type CodeViewHandle, type CodeViewProps } from "@pierre/diffs/react";
import type { ReviewFileContext, ReviewFinding, ScopedThreadRef } from "@t3tools/contracts";
import { useCallback, useMemo, useRef, useState, type ReactNode, type Ref } from "react";

import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { fnv1a32 } from "~/lib/diffRendering";
import { cn } from "~/lib/utils";
import {
  buildDiffReviewComment,
  restoreDiffReviewCommentRange,
  type ReviewCommentContext,
} from "~/reviewCommentContext";

import { LocalCommentAnnotation } from "../files/LocalCommentAnnotation";
import { nextFileCommentId } from "../files/fileCommentAnnotations";

interface DiffCommentAnnotationEntry {
  id: string;
  kind: "draft" | "comment" | "finding" | "context";
  filePath: string;
  range: SelectedLineRange;
  rangeLabel: string;
  text: string;
  finding?: ReviewFinding;
  fileContext?: ReviewFileContext;
}

interface DiffCommentAnnotationGroup {
  entries: DiffCommentAnnotationEntry[];
}

type DiffCommentLineAnnotation = DiffLineAnnotation<DiffCommentAnnotationGroup>;
export type AnnotatableCodeViewHandle = CodeViewHandle<DiffCommentAnnotationGroup>;
type AnnotatableCodeViewScrollViewer = {
  getTopForItem(id: string): number | undefined;
};
const EMPTY_REVIEW_COMMENTS: ReadonlyArray<ReviewCommentContext> = [];

function annotationSide(range: SelectedLineRange): AnnotationSide {
  return (range.endSide ?? range.side) === "deletions" ? "deletions" : "additions";
}

function appendAnnotationEntry(
  annotations: ReadonlyArray<DiffCommentLineAnnotation>,
  range: SelectedLineRange,
  entry: DiffCommentAnnotationEntry,
): DiffCommentLineAnnotation[] {
  const side = annotationSide(range);
  const annotationIndex = annotations.findIndex(
    (annotation) => annotation.side === side && annotation.lineNumber === range.end,
  );
  if (annotationIndex < 0) {
    return [
      ...annotations,
      {
        side,
        lineNumber: range.end,
        metadata: { entries: [entry] },
      },
    ];
  }
  return annotations.map((annotation, index) =>
    index === annotationIndex
      ? {
          ...annotation,
          metadata: { entries: [...annotation.metadata.entries, entry] },
        }
      : annotation,
  );
}

interface AnnotatableCodeViewProps {
  files: ReadonlyArray<{
    fileDiff: FileDiffMetadata;
    filePath: string;
    fileKey: string;
    collapsed: boolean;
  }>;
  sectionId: string;
  sectionTitle: string;
  composerDraftTarget: ScopedThreadRef | DraftId;
  reviewFileContextByPath?: ReadonlyMap<string, ReviewFileContext>;
  reviewFindingsByFilePath?: ReadonlyMap<string, ReadonlyArray<ReviewFinding>>;
  options: NonNullable<CodeViewProps<DiffCommentAnnotationGroup>["options"]>;
  viewerRef?: Ref<AnnotatableCodeViewHandle>;
  className?: string;
  onScroll?: (scrollTop: number, viewer: AnnotatableCodeViewScrollViewer) => void;
  renderHeaderPrefix: (
    fileDiff: FileDiffMetadata,
    fileKey: string,
    collapsed: boolean,
  ) => ReactNode;
}

interface DiffSelectionContext {
  item: CodeViewItem<DiffCommentAnnotationGroup>;
}

interface DiffCodeViewSelection {
  id: string;
  range: SelectedLineRange;
}

export function AnnotatableCodeView({
  files,
  sectionId,
  sectionTitle,
  composerDraftTarget,
  reviewFileContextByPath,
  reviewFindingsByFilePath,
  options,
  viewerRef,
  className,
  onScroll,
  renderHeaderPrefix,
}: AnnotatableCodeViewProps) {
  const addReviewComment = useComposerDraftStore((store) => store.addReviewComment);
  const removeReviewComment = useComposerDraftStore((store) => store.removeReviewComment);
  const reviewComments = useComposerDraftStore(
    (store) => store.getComposerDraft(composerDraftTarget)?.reviewComments ?? EMPTY_REVIEW_COMMENTS,
  );
  const [selectedLines, setSelectedLinesState] = useState<DiffCodeViewSelection | null>(null);
  const selectedLinesRef = useRef<DiffCodeViewSelection | null>(null);
  const [draft, setDraft] = useState<{
    fileKey: string;
    annotation: DiffCommentLineAnnotation;
  } | null>(null);

  const filesByKey = useMemo(() => new Map(files.map((file) => [file.fileKey, file])), [files]);
  const items = useMemo<CodeViewDiffItem<DiffCommentAnnotationGroup>[]>(
    () =>
      files.map(({ fileDiff, filePath, fileKey, collapsed }) => {
        const contextEntry = (() => {
          const fileContext = reviewFileContextByPath?.get(filePath);
          if (!fileContext) return [];
          const range = restoreDiffReviewCommentRange(fileDiff, {
            id: `${fileKey}:context`,
            sectionId,
            sectionTitle,
            filePath,
            startIndex: 0,
            endIndex: 0,
            rangeLabel: "File context",
            text: "",
            diff: "",
          });
          if (!range) return [];
          return appendAnnotationEntry([], range, {
            id: `${fileKey}:context`,
            kind: "context",
            filePath,
            range,
            rangeLabel: "File context",
            text: fileContext.explanation,
            fileContext,
          });
        })();
        const findings = (reviewFindingsByFilePath?.get(filePath) ?? []).reduce<
          DiffCommentLineAnnotation[]
        >((annotations, finding) => {
          const anchor = finding.anchor;
          if (!anchor) return annotations;
          const range = restoreDiffReviewCommentRange(fileDiff, {
            id: finding.id,
            sectionId,
            sectionTitle,
            filePath,
            startIndex: anchor.startIndex,
            endIndex: anchor.endIndex,
            rangeLabel: anchor.rangeLabel,
            text: finding.body,
            diff: "",
          });
          if (!range) return annotations;
          return appendAnnotationEntry(annotations, range, {
            id: finding.id,
            kind: "finding",
            filePath,
            range,
            rangeLabel: anchor.rangeLabel,
            text: finding.body,
            finding,
          });
        }, contextEntry);
        const persisted = reviewComments
          .filter(
            (comment) =>
              comment.sectionId === sectionId &&
              comment.filePath === filePath &&
              (comment.fenceLanguage ?? "diff") === "diff",
          )
          .reduce<DiffCommentLineAnnotation[]>((annotations, comment) => {
            const range = restoreDiffReviewCommentRange(fileDiff, comment);
            if (!range) return annotations;
            return appendAnnotationEntry(annotations, range, {
              id: comment.id,
              kind: "comment",
              filePath,
              range,
              rangeLabel: comment.rangeLabel,
              text: comment.text,
            });
          }, findings);
        const annotations =
          draft?.fileKey === fileKey ? [...persisted, draft.annotation] : persisted;
        return {
          id: fileKey,
          type: "diff",
          fileDiff,
          annotations,
          collapsed,
          version: fnv1a32(
            `${collapsed ? "1" : "0"}:${annotations
              .flatMap((annotation) =>
                annotation.metadata.entries.map(
                  (entry) => `${entry.id}:${entry.rangeLabel}:${entry.text}`,
                ),
              )
              .join(":")}`,
          ),
        };
      }),
    [
      draft,
      files,
      reviewComments,
      reviewFileContextByPath,
      reviewFindingsByFilePath,
      sectionId,
      sectionTitle,
    ],
  );

  const setSelectedLines = useCallback((selection: DiffCodeViewSelection | null) => {
    selectedLinesRef.current = selection;
    setSelectedLinesState(selection);
  }, []);

  const removeEntry = useCallback(
    (entryId: string) => {
      setSelectedLines(null);
      if (draft?.annotation.metadata.entries.some((entry) => entry.id === entryId)) {
        setDraft(null);
      } else {
        removeReviewComment(composerDraftTarget, entryId);
      }
    },
    [composerDraftTarget, draft, removeReviewComment, setSelectedLines],
  );

  const submitEntry = useCallback(
    (entryId: string, text: string) => {
      const entry = draft?.annotation.metadata.entries.find(
        (candidate) => candidate.id === entryId,
      );
      const file = draft ? filesByKey.get(draft.fileKey) : undefined;
      if (!entry || !file) return;
      const comment = buildDiffReviewComment({
        id: entry.id,
        sectionId,
        sectionTitle,
        filePath: file.filePath,
        fileDiff: file.fileDiff,
        range: entry.range,
        text,
      });
      if (comment) addReviewComment(composerDraftTarget, comment);
      setSelectedLines(null);
      setDraft(null);
    },
    [
      addReviewComment,
      composerDraftTarget,
      draft,
      filesByKey,
      sectionId,
      sectionTitle,
      setSelectedLines,
    ],
  );

  const beginComment = useCallback(
    (range: SelectedLineRange | null, context?: DiffSelectionContext) => {
      if (!range) return;
      const fileKey =
        context?.item.type === "diff" ? context.item.id : selectedLinesRef.current?.id;
      if (!fileKey) return;
      const file = filesByKey.get(fileKey);
      if (!file) return;
      const id = nextFileCommentId();
      const comment = buildDiffReviewComment({
        id,
        sectionId,
        sectionTitle,
        filePath: file.filePath,
        fileDiff: file.fileDiff,
        range,
        text: "",
      });
      if (!comment) return;
      setDraft({
        fileKey,
        annotation: {
          side: annotationSide(range),
          lineNumber: range.end,
          metadata: {
            entries: [
              {
                id,
                kind: "draft",
                filePath: file.filePath,
                range,
                rangeLabel: comment.rangeLabel,
                text: "",
              },
            ],
          },
        },
      });
    },
    [filesByKey, sectionId, sectionTitle],
  );
  const adoptFinding = useCallback(
    (entry: DiffCommentAnnotationEntry) => {
      const finding = entry.finding;
      if (!finding) return;
      const file = files.find((candidate) => candidate.filePath === entry.filePath);
      if (!file) return;
      const text = [
        finding.title,
        finding.body,
        finding.suggestedFix ? `Suggested fix:\n${finding.suggestedFix}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      const comment = buildDiffReviewComment({
        id: nextFileCommentId(),
        sectionId,
        sectionTitle,
        filePath: file.filePath,
        fileDiff: file.fileDiff,
        range: entry.range,
        text,
      });
      if (comment) addReviewComment(composerDraftTarget, comment);
    },
    [addReviewComment, composerDraftTarget, files, sectionId, sectionTitle],
  );
  const renderAnnotationEntry = useCallback(
    (entry: DiffCommentAnnotationEntry) => {
      switch (entry.kind) {
        case "finding":
          return entry.finding ? (
            <AgentReviewFindingAnnotation
              key={entry.id}
              finding={entry.finding}
              rangeLabel={entry.rangeLabel}
              onAdopt={() => adoptFinding(entry)}
            />
          ) : null;
        case "context":
          return entry.fileContext ? (
            <AgentReviewFileContextAnnotation key={entry.id} fileContext={entry.fileContext} />
          ) : null;
        case "draft":
        case "comment":
          return (
            <LocalCommentAnnotation
              key={entry.id}
              kind={entry.kind}
              rangeLabel={entry.rangeLabel}
              text={entry.text}
              onCancel={() => removeEntry(entry.id)}
              onComment={(text) => submitEntry(entry.id, text)}
              onDelete={() => removeEntry(entry.id)}
            />
          );
      }
    },
    [adoptFinding, removeEntry, submitEntry],
  );

  const hasOpenComment = draft !== null;
  return (
    <CodeView<DiffCommentAnnotationGroup>
      {...(viewerRef ? { ref: viewerRef } : {})}
      {...(className ? { className } : {})}
      {...(onScroll ? { onScroll } : {})}
      items={items}
      selectedLines={selectedLines}
      onSelectedLinesChange={setSelectedLines}
      options={{
        ...options,
        enableGutterUtility: !hasOpenComment,
        enableLineSelection: !hasOpenComment,
        onGutterUtilityClick: beginComment,
        onLineSelectionEnd: beginComment,
      }}
      renderHeaderPrefix={(item) =>
        item.type === "diff"
          ? renderHeaderPrefix(item.fileDiff, item.id, item.collapsed === true)
          : null
      }
      renderAnnotation={(annotation) => (
        <div className="py-1">{annotation.metadata.entries.map(renderAnnotationEntry)}</div>
      )}
    />
  );
}

function reviewSeverityClassName(severity: ReviewFinding["severity"]): string {
  switch (severity) {
    case "critical":
      return "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300";
    case "major":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "minor":
      return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300";
    case "info":
      return "border-border bg-muted text-muted-foreground";
  }
}

function AgentReviewFileContextAnnotation({ fileContext }: { fileContext: ReviewFileContext }) {
  return (
    <div className="rounded-md border border-border/70 bg-background px-3 py-2 text-xs text-foreground shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        <span>{fileContext.changeKind}</span>
        <span>
          {fileContext.additions}+ / {fileContext.deletions}-
        </span>
        <span>{fileContext.hunkCount} hunks</span>
        {fileContext.truncated ? <span>truncated</span> : null}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{fileContext.explanation}</p>
    </div>
  );
}

function AgentReviewFindingAnnotation({
  finding,
  rangeLabel,
  onAdopt,
}: {
  finding: ReviewFinding;
  rangeLabel: string;
  onAdopt: () => void;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-background px-3 py-2 text-xs text-foreground shadow-sm">
      <div className="mb-1.5 flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase",
            reviewSeverityClassName(finding.severity),
          )}
        >
          {finding.severity}
        </span>
        <span className="truncate font-medium">{finding.title}</span>
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{rangeLabel}</span>
      </div>
      <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
        {finding.body}
      </p>
      {finding.suggestedFix ? (
        <pre className="mt-2 max-h-48 overflow-auto rounded-sm border border-border/70 bg-muted/40 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
          {finding.suggestedFix}
        </pre>
      ) : null}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
          onClick={onAdopt}
        >
          Adopt
        </button>
      </div>
    </div>
  );
}
