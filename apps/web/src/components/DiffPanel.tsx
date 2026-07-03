import { useAtomValue } from "@effect/atom-react";
import { useParams } from "@tanstack/react-router";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { safeErrorLogAttributes } from "@t3tools/client-runtime/errors";
import type {
  ReviewFileContext,
  ReviewFinding,
  ReviewId,
  ScopedThreadRef,
  TurnId,
} from "@t3tools/contracts";
import type { FileDiffMetadata } from "@pierre/diffs";
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Columns2Icon,
  FileSearchIcon,
  FolderClosedIcon,
  FolderIcon,
  PilcrowIcon,
  RefreshCwIcon,
  Rows3Icon,
  SearchIcon,
  TextWrapIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOpenInPreferredEditor } from "../editorPreferences";
import { type DraftId } from "../composerDraftStore";
import { openDiffFilePrimaryAction } from "../diffFileActions";
import { useCheckpointDiff } from "~/lib/checkpointDiffState";
import { cn } from "~/lib/utils";
import { selectThreadDiffPanelSelection, useDiffPanelStore } from "../diffPanelStore";
import { useTheme } from "../hooks/useTheme";
import {
  buildFileDiffRenderKey,
  getDiffCollapseIconClassName,
  getRenderablePatch,
  resolveDiffThemeName,
  resolveFileDiffPath,
  summarizeFileDiffStats,
} from "../lib/diffRendering";
import { buildTurnDiffTree, type TurnDiffTreeNode } from "../lib/turnDiffTree";
import { useTurnDiffSummaries } from "../hooks/useTurnDiffSummaries";
import { useProject, useThread } from "../state/entities";
import { resolveThreadRouteRef } from "../threadRoutes";
import { useClientSettings } from "../hooks/useSettings";
import { formatShortTimestamp } from "../timestampFormat";
import { DiffPanelLoadingState, DiffPanelShell, type DiffPanelMode } from "./DiffPanelShell";
import { AnnotatableCodeView, type AnnotatableCodeViewHandle } from "./diffs/AnnotatableCodeView";
import { DiffStatLabel, hasNonZeroStat } from "./chat/DiffStatLabel";
import { PierreEntryIcon } from "./chat/PierreEntryIcon";
import { ToggleGroup, Toggle } from "./ui/toggle-group";
import { Switch } from "./ui/switch";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxTrigger,
} from "./ui/combobox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { serverEnvironment } from "../state/server";
import { reviewEnvironment } from "../state/review";
import { vcsEnvironment } from "../state/vcs";
import { buildBaseRefChoices, filterBaseRefChoices } from "../lib/baseRefChoices";
import { useRightPanelStore } from "../rightPanelStore";

type DiffRenderMode = "stacked" | "split";
type DiffThemeType = "light" | "dark";
const AUTOMATIC_BASE_REF = "__automatic_base_ref__";

interface CollapsedDiffFilesState {
  readonly scopeKey: string | null;
  readonly fileKeys: ReadonlySet<string>;
}

interface DiffCodeViewFile {
  readonly fileDiff: FileDiffMetadata;
  readonly filePath: string;
  readonly fileKey: string;
  readonly collapsed: boolean;
}

const EMPTY_COLLAPSED_DIFF_FILE_KEYS: ReadonlySet<string> = new Set();

const DIFF_PANEL_UNSAFE_CSS = `
[data-diffs-header],
[data-diff],
[data-file],
[data-error-wrapper],
[data-virtualizer-buffer] {
  --diffs-header-font-family: var(--font-sans) !important;
  --diffs-font-family: var(--font-mono) !important;
  --diffs-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-light-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-dark-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-token-light-bg: transparent;
  --diffs-token-dark-bg: transparent;

  --diffs-bg-context-override: color-mix(in srgb, var(--background) 97%, var(--foreground));
  --diffs-bg-hover-override: color-mix(in srgb, var(--background) 94%, var(--foreground));
  --diffs-bg-separator-override: color-mix(in srgb, var(--background) 95%, var(--foreground));
  --diffs-bg-buffer-override: color-mix(in srgb, var(--background) 90%, var(--foreground));

  --diffs-bg-addition-override: color-mix(in srgb, var(--background) 92%, var(--success));
  --diffs-bg-addition-number-override: color-mix(in srgb, var(--background) 88%, var(--success));
  --diffs-bg-addition-hover-override: color-mix(in srgb, var(--background) 85%, var(--success));
  --diffs-bg-addition-emphasis-override: color-mix(in srgb, var(--background) 80%, var(--success));

  --diffs-bg-deletion-override: color-mix(in srgb, var(--background) 92%, var(--destructive));
  --diffs-bg-deletion-number-override: color-mix(in srgb, var(--background) 88%, var(--destructive));
  --diffs-bg-deletion-hover-override: color-mix(in srgb, var(--background) 85%, var(--destructive));
  --diffs-bg-deletion-emphasis-override: color-mix(
    in srgb,
    var(--background) 80%,
    var(--destructive)
  );

  background-color: var(--diffs-bg) !important;
}

[data-file-info] {
  background-color: color-mix(in srgb, var(--card) 94%, var(--foreground)) !important;
  border-block-color: var(--border) !important;
  color: var(--foreground) !important;
}

[data-diffs-header] {
  position: sticky !important;
  top: 0;
  z-index: 4;
  background-color: color-mix(in srgb, var(--card) 94%, var(--foreground)) !important;
  border-bottom: 1px solid var(--border) !important;
  align-items: center !important;
  font-family: var(--font-sans) !important;
  font-size: 12px !important;
  line-height: 1 !important;
  min-height: 32px !important;
  padding-block: 6px !important;
}

[data-diffs-header] [data-header-content] {
  align-items: center !important;
  line-height: 1 !important;
}

[data-diffs-header] [data-metadata] {
  align-items: center !important;
  line-height: 1 !important;
  font-variant-numeric: tabular-nums;
}

[data-diffs-header] [data-additions-count],
[data-diffs-header] [data-deletions-count] {
  font-family: var(--font-mono) !important;
  font-size: 11px !important;
  font-variant-numeric: tabular-nums;
  line-height: 1 !important;
}

[data-diffs-header] [data-change-icon],
[data-diffs-header] [data-rename-icon] {
  display: block;
  flex-shrink: 0;
}

[data-title] {
  cursor: pointer;
  transition:
    color 120ms ease,
    text-decoration-color 120ms ease;
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 2px;
  font-family: var(--font-sans) !important;
}

[data-title]:hover {
  color: color-mix(in srgb, var(--foreground) 84%, var(--primary)) !important;
  text-decoration-color: currentColor;
}
`;

interface DiffPanelProps {
  mode?: DiffPanelMode;
  composerDraftTarget: ScopedThreadRef | DraftId;
  reviewId?: ReviewId | undefined;
}

export { DiffWorkerPoolProvider } from "./DiffWorkerPoolProvider";

export default function DiffPanel({
  mode = "inline",
  composerDraftTarget,
  reviewId,
}: DiffPanelProps) {
  const { resolvedTheme } = useTheme();
  const settings = useClientSettings();
  const [diffRenderMode, setDiffRenderMode] = useState<DiffRenderMode>("stacked");
  const [wordWrap, setWordWrap] = useState(settings.wordWrap);
  const [diffIgnoreWhitespace, setDiffIgnoreWhitespace] = useState(settings.diffIgnoreWhitespace);
  const [baseRefQuery, setBaseRefQuery] = useState("");
  const [collapsedDiffFiles, setCollapsedDiffFiles] = useState<CollapsedDiffFilesState>(() => ({
    scopeKey: null,
    fileKeys: EMPTY_COLLAPSED_DIFF_FILE_KEYS,
  }));
  const [navigatedFileKey, setNavigatedFileKey] = useState<string | null>(null);
  const [reviewActionError, setReviewActionError] = useState<string | null>(null);
  const [reviewActionPending, setReviewActionPending] = useState<"open" | "refresh" | null>(null);
  const codeViewRef = useRef<AnnotatableCodeViewHandle>(null);
  const openReviewSnapshot = useAtomCommand(reviewEnvironment.openSnapshot, {
    reportFailure: false,
  });
  const refreshReviewSnapshot = useAtomCommand(reviewEnvironment.refreshSnapshot, {
    reportFailure: false,
  });

  const routeThreadRef = useParams({
    strict: false,
    select: (params) => resolveThreadRouteRef(params),
  });
  const diffSelection = useDiffPanelStore((state) =>
    selectThreadDiffPanelSelection(state.byThreadKey, routeThreadRef),
  );
  const activeThreadId = routeThreadRef?.threadId ?? null;
  const activeThread = useThread(routeThreadRef);
  const activeProjectId = activeThread?.projectId ?? null;
  const activeProject = useProject(
    activeThread && activeProjectId
      ? {
          environmentId: activeThread.environmentId,
          projectId: activeProjectId,
        }
      : null,
  );
  const activeCwd = activeThread?.worktreePath ?? activeProject?.workspaceRoot;
  const serverConfig = useAtomValue(
    serverEnvironment.configValueAtom(activeThread?.environmentId ?? null),
  );
  const openInPreferredEditor = useOpenInPreferredEditor(
    activeThread?.environmentId ?? null,
    serverConfig?.availableEditors ?? [],
  );
  const reviewSnapshotQuery = useEnvironmentQuery(
    activeThread && reviewId
      ? reviewEnvironment.snapshot({
          environmentId: activeThread.environmentId,
          input: { reviewId },
        })
      : null,
  );
  const reviewSnapshot = reviewSnapshotQuery.data;
  const isReviewMode = reviewId !== undefined;
  const gitStatusQuery = useEnvironmentQuery(
    activeThread !== null && activeThread !== undefined && activeCwd != null
      ? vcsEnvironment.status({
          environmentId: activeThread.environmentId,
          input: { cwd: activeCwd },
        })
      : null,
  );
  const isGitRepo = gitStatusQuery.data?.isRepo ?? true;
  const { turnDiffSummaries, inferredCheckpointTurnCountByTurnId } =
    useTurnDiffSummaries(activeThread);
  const orderedTurnDiffSummaries = useMemo(
    () =>
      [...turnDiffSummaries].toSorted((left, right) => {
        const leftTurnCount =
          left.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[left.turnId] ?? 0;
        const rightTurnCount =
          right.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[right.turnId] ?? 0;
        if (leftTurnCount !== rightTurnCount) {
          return rightTurnCount - leftTurnCount;
        }
        return right.completedAt.localeCompare(left.completedAt);
      }),
    [inferredCheckpointTurnCountByTurnId, turnDiffSummaries],
  );

  useEffect(() => {
    if (!routeThreadRef || diffSelection.kind !== "turn") return;
    useDiffPanelStore.getState().reconcileTurnSelection(
      routeThreadRef,
      orderedTurnDiffSummaries.map((summary) => summary.turnId),
    );
  }, [diffSelection, orderedTurnDiffSummaries, routeThreadRef]);

  const selectedTurnId = diffSelection.kind === "turn" ? diffSelection.turnId : null;
  const selectedGitScope = diffSelection.kind === "unstaged" ? "unstaged" : "branch";
  const selectedBaseRef = diffSelection.kind === "branch" ? diffSelection.baseRef : null;
  const selectedFilePath = diffSelection.kind === "turn" ? diffSelection.filePath : null;
  const selectedFileRevealRequestId =
    diffSelection.kind === "turn" ? diffSelection.revealRequestId : 0;
  const selectedTurn =
    selectedTurnId === null
      ? undefined
      : (orderedTurnDiffSummaries.find((summary) => summary.turnId === selectedTurnId) ??
        orderedTurnDiffSummaries[0]);
  const selectedCheckpointTurnCount =
    selectedTurn &&
    (selectedTurn.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[selectedTurn.turnId]);
  const latestTurn = orderedTurnDiffSummaries[0];
  const selectedScopeLabel =
    selectedTurnId === null
      ? selectedGitScope === "unstaged"
        ? "Working tree"
        : "Branch changes"
      : selectedTurn?.turnId === latestTurn?.turnId
        ? "Latest turn"
        : `Turn ${selectedCheckpointTurnCount ?? "?"}`;
  const reviewSectionId = selectedTurn ? `turn:${selectedTurn.turnId}` : selectedGitScope;
  const activeReviewSectionId = reviewSnapshot
    ? `review:${reviewSnapshot.reviewId}`
    : reviewSectionId;
  const collapseScopeKey = routeThreadRef
    ? `${routeThreadRef.environmentId}:${routeThreadRef.threadId}:${activeReviewSectionId}`
    : null;
  const collapsedDiffFileKeys =
    collapsedDiffFiles.scopeKey === collapseScopeKey
      ? collapsedDiffFiles.fileKeys
      : EMPTY_COLLAPSED_DIFF_FILE_KEYS;
  const reviewSectionTitle = selectedTurn
    ? `Turn ${selectedCheckpointTurnCount ?? "?"}`
    : selectedGitScope === "unstaged"
      ? "Working tree"
      : "Branch changes";
  const activeReviewSectionTitle = reviewSnapshot?.source.title ?? reviewSectionTitle;
  const selectedCheckpointRange = useMemo(
    () =>
      typeof selectedCheckpointTurnCount === "number"
        ? {
            fromTurnCount: Math.max(0, selectedCheckpointTurnCount - 1),
            toTurnCount: selectedCheckpointTurnCount,
          }
        : null,
    [selectedCheckpointTurnCount],
  );
  const activeCheckpointDiff = useCheckpointDiff(
    {
      environmentId: activeThread?.environmentId ?? null,
      threadId: activeThreadId,
      fromTurnCount: selectedCheckpointRange?.fromTurnCount ?? null,
      toTurnCount: selectedCheckpointRange?.toTurnCount ?? null,
      ignoreWhitespace: diffIgnoreWhitespace,
      cacheScope: selectedTurn ? `turn:${selectedTurn.turnId}` : null,
    },
    { enabled: isGitRepo && selectedTurn !== undefined },
  );
  const primaryBranchDiffPreview = useEnvironmentQuery(
    selectedTurnId === null && activeThread && activeCwd
      ? reviewEnvironment.diffPreview({
          environmentId: activeThread.environmentId,
          input: {
            cwd: activeCwd,
            ...(selectedBaseRef ? { baseRef: selectedBaseRef } : {}),
            ignoreWhitespace: diffIgnoreWhitespace,
          },
        })
      : null,
  );
  const shouldRetryBranchDiffAtEnvironmentCwd =
    selectedTurnId === null &&
    primaryBranchDiffPreview.error?.includes("configured workspace root") === true &&
    serverConfig?.cwd !== undefined &&
    serverConfig.cwd !== activeCwd;
  const fallbackBranchDiffPreview = useEnvironmentQuery(
    shouldRetryBranchDiffAtEnvironmentCwd && activeThread && serverConfig
      ? reviewEnvironment.diffPreview({
          environmentId: activeThread.environmentId,
          input: {
            cwd: serverConfig.cwd,
            ...(selectedBaseRef ? { baseRef: selectedBaseRef } : {}),
            ignoreWhitespace: diffIgnoreWhitespace,
          },
        })
      : null,
  );
  const branchDiffPreview = shouldRetryBranchDiffAtEnvironmentCwd
    ? fallbackBranchDiffPreview
    : primaryBranchDiffPreview;
  const selectedGitSource = branchDiffPreview.data?.sources.find(
    (source) => source.kind === (selectedGitScope === "unstaged" ? "working-tree" : "branch-range"),
  );
  const localBranchRefs = useEnvironmentQuery(
    selectedTurnId === null &&
      selectedGitScope === "branch" &&
      activeThread &&
      branchDiffPreview.data?.cwd
      ? vcsEnvironment.listRefs({
          environmentId: activeThread.environmentId,
          input: {
            cwd: branchDiffPreview.data.cwd,
            includeMatchingRemoteRefs: true,
            refKind: "local",
            ...(baseRefQuery.trim().length > 0 ? { query: baseRefQuery.trim() } : {}),
            limit: 100,
          },
        })
      : null,
  );
  const remoteBranchRefs = useEnvironmentQuery(
    selectedTurnId === null &&
      selectedGitScope === "branch" &&
      activeThread &&
      branchDiffPreview.data?.cwd
      ? vcsEnvironment.listRefs({
          environmentId: activeThread.environmentId,
          input: {
            cwd: branchDiffPreview.data.cwd,
            includeMatchingRemoteRefs: true,
            refKind: "remote",
            ...(baseRefQuery.trim().length > 0 ? { query: baseRefQuery.trim() } : {}),
            limit: 100,
          },
        })
      : null,
  );
  const baseRefChoices = buildBaseRefChoices(
    localBranchRefs.data?.refs.filter((ref) => ref.name !== selectedGitSource?.headRef) ?? [],
    remoteBranchRefs.data?.refs ?? [],
  );
  const matchingBaseRefChoices = filterBaseRefChoices(baseRefChoices, baseRefQuery);
  const valueForBaseRefChoice = (choice: (typeof baseRefChoices)[number]) =>
    selectedBaseRef && selectedBaseRef === choice.remote?.name
      ? selectedBaseRef
      : (choice.local?.name ?? choice.remote?.name ?? choice.id);
  const baseRefItems = [AUTOMATIC_BASE_REF, ...baseRefChoices.map(valueForBaseRefChoice)];
  const filteredBaseRefItems = [
    ...(baseRefQuery.trim().length === 0 ? [AUTOMATIC_BASE_REF] : []),
    ...matchingBaseRefChoices.map(valueForBaseRefChoice),
  ];
  const gitDiff = selectedGitSource?.diff;

  const liveSelectedPatch = selectedTurn ? activeCheckpointDiff.data?.diff : gitDiff;
  const liveSelectedPatchTruncated = !selectedTurn && selectedGitSource?.truncated === true;
  const liveSelectedPatchLoading = selectedTurn
    ? activeCheckpointDiff.isPending
    : branchDiffPreview.isPending;
  const liveSelectedPatchError = selectedTurn
    ? activeCheckpointDiff.error
    : branchDiffPreview.error;
  const selectedPatch = isReviewMode ? reviewSnapshot?.diff : liveSelectedPatch;
  const isSelectedPatchTruncated = isReviewMode
    ? reviewSnapshot?.diffTruncated === true
    : liveSelectedPatchTruncated;
  const isLoadingSelectedPatch = isReviewMode
    ? reviewSnapshotQuery.isPending && !reviewSnapshot
    : liveSelectedPatchLoading;
  const selectedPatchError = isReviewMode ? reviewSnapshotQuery.error : liveSelectedPatchError;
  const hasResolvedPatch = typeof selectedPatch === "string";
  const hasNoNetChanges = hasResolvedPatch && selectedPatch.trim().length === 0;
  const renderablePatch = useMemo(
    () =>
      getRenderablePatch(selectedPatch, `diff-panel:${resolvedTheme}`, {
        compactPartialHunkOffsets: isReviewMode
          ? reviewSnapshot?.source.kind !== "turn"
          : selectedTurnId === null,
      }),
    [isReviewMode, resolvedTheme, reviewSnapshot?.source.kind, selectedPatch, selectedTurnId],
  );
  const renderableFiles = useMemo(() => {
    if (!renderablePatch || renderablePatch.kind !== "files") {
      return [];
    }
    return renderablePatch.files.toSorted((left, right) =>
      resolveFileDiffPath(left).localeCompare(resolveFileDiffPath(right), undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  }, [renderablePatch]);
  const codeViewFiles = useMemo<DiffCodeViewFile[]>(
    () =>
      renderableFiles.map((fileDiff) => {
        const fileKey = buildFileDiffRenderKey(fileDiff);
        return {
          fileDiff,
          filePath: resolveFileDiffPath(fileDiff),
          fileKey,
          collapsed: collapsedDiffFileKeys.has(fileKey),
        };
      }),
    [collapsedDiffFileKeys, renderableFiles],
  );
  const reviewFileContextByPath = useMemo(
    () => new Map((reviewSnapshot?.files ?? []).map((file) => [file.filePath, file])),
    [reviewSnapshot?.files],
  );
  const reviewFindingsByFilePath = useMemo(
    () =>
      new Map(
        (reviewSnapshot?.files ?? []).map((file) => [
          file.filePath,
          file.findings.filter((finding) => finding.anchor !== null),
        ]),
      ),
    [reviewSnapshot?.files],
  );
  const selectedFileKey = selectedFilePath
    ? (codeViewFiles.find((candidate) => candidate.filePath === selectedFilePath)?.fileKey ?? null)
    : null;
  const activeNavigatorFileKey = codeViewFiles.some(
    (candidate) => candidate.fileKey === navigatedFileKey,
  )
    ? navigatedFileKey
    : selectedFileKey;

  useEffect(() => {
    setNavigatedFileKey(null);
  }, [collapseScopeKey]);

  useEffect(() => {
    if (!selectedFilePath) return;
    const file = codeViewFiles.find((candidate) => candidate.filePath === selectedFilePath);
    if (!file) return;
    setNavigatedFileKey(file.fileKey);
    codeViewRef.current?.scrollTo({ type: "item", id: file.fileKey, align: "start" });
  }, [codeViewFiles, selectedFilePath, selectedFileRevealRequestId]);

  const scrollToDiffFile = useCallback((fileKey: string) => {
    setNavigatedFileKey(fileKey);
    codeViewRef.current?.scrollTo({ type: "item", id: fileKey, align: "start" });
  }, []);

  const openDiffFile = useCallback(
    (filePath: string) => {
      openDiffFilePrimaryAction({
        threadRef: routeThreadRef,
        filePath,
        activeCwd,
        openInEditor: (targetPath) => {
          void (async () => {
            const result = await openInPreferredEditor(targetPath);
            if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
              console.warn("Failed to open diff file in editor.", {
                operation: "open-diff-file",
                ...(routeThreadRef
                  ? {
                      environmentId: routeThreadRef.environmentId,
                      threadId: routeThreadRef.threadId,
                    }
                  : {}),
                ...safeErrorLogAttributes(squashAtomCommandFailure(result)),
              });
            }
          })();
        },
      });
    },
    [activeCwd, openInPreferredEditor, routeThreadRef],
  );
  const toggleDiffFileCollapsed = useCallback(
    (fileKey: string) => {
      setCollapsedDiffFiles((current) => {
        const next = new Set(current.scopeKey === collapseScopeKey ? current.fileKeys : []);
        if (next.has(fileKey)) {
          next.delete(fileKey);
        } else {
          next.add(fileKey);
        }
        return { scopeKey: collapseScopeKey, fileKeys: next };
      });
    },
    [collapseScopeKey],
  );

  const selectTurn = (turnId: TurnId) => {
    if (!routeThreadRef) return;
    useDiffPanelStore.getState().selectTurn(routeThreadRef, turnId);
  };
  const selectGitScope = (scope: "branch" | "unstaged") => {
    if (!routeThreadRef) return;
    useDiffPanelStore.getState().selectGitScope(routeThreadRef, scope);
  };
  const selectBranchBaseRef = (baseRef: string | null) => {
    if (!routeThreadRef) return;
    useDiffPanelStore.getState().selectBranchBaseRef(routeThreadRef, baseRef);
  };
  const handleOpenReview = useCallback(() => {
    if (!routeThreadRef || !activeThread || !activeCwd) return;
    const cwd = branchDiffPreview.data?.cwd ?? activeCwd;
    const source =
      selectedTurn && selectedCheckpointRange
        ? {
            kind: "turn" as const,
            turnId: selectedTurn.turnId,
            fromTurnCount: selectedCheckpointRange.fromTurnCount,
            toTurnCount: selectedCheckpointRange.toTurnCount,
            title: reviewSectionTitle,
          }
        : selectedGitSource?.diff.trim()
          ? {
              kind:
                selectedGitScope === "unstaged"
                  ? ("working-tree" as const)
                  : ("branch-range" as const),
              ...(selectedBaseRef ? { baseRef: selectedBaseRef } : {}),
              ...(selectedGitSource?.title ? { title: selectedGitSource.title } : {}),
            }
          : {
              kind: "smart" as const,
              ...(selectedBaseRef ? { baseRef: selectedBaseRef } : {}),
            };

    setReviewActionError(null);
    setReviewActionPending("open");
    void openReviewSnapshot({
      environmentId: activeThread.environmentId,
      input: {
        cwd,
        threadId: routeThreadRef.threadId,
        origin: "manual",
        source,
        ignoreWhitespace: diffIgnoreWhitespace,
      },
    }).then((result) => {
      setReviewActionPending(null);
      if (result._tag === "Success") {
        useRightPanelStore.getState().openReview(routeThreadRef, result.value.reviewId);
        return;
      }
      if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        setReviewActionError(error instanceof Error ? error.message : "Failed to open review.");
      }
    });
  }, [
    activeCwd,
    activeThread,
    branchDiffPreview.data?.cwd,
    diffIgnoreWhitespace,
    openReviewSnapshot,
    reviewSectionTitle,
    routeThreadRef,
    selectedBaseRef,
    selectedCheckpointRange,
    selectedGitScope,
    selectedGitSource?.title,
    selectedTurn,
  ]);
  const handleRefreshReview = useCallback(() => {
    if (!routeThreadRef || !activeThread || !reviewId) return;
    setReviewActionError(null);
    setReviewActionPending("refresh");
    void refreshReviewSnapshot({
      environmentId: activeThread.environmentId,
      input: { reviewId },
    }).then((result) => {
      setReviewActionPending(null);
      if (result._tag === "Success") {
        useRightPanelStore.getState().openReview(routeThreadRef, result.value.reviewId);
        reviewSnapshotQuery.refresh();
        return;
      }
      if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        setReviewActionError(error instanceof Error ? error.message : "Failed to refresh review.");
      }
    });
  }, [activeThread, refreshReviewSnapshot, reviewId, reviewSnapshotQuery, routeThreadRef]);
  const handleExitReview = useCallback(() => {
    if (!routeThreadRef) return;
    useRightPanelStore.getState().open(routeThreadRef, "diff");
  }, [routeThreadRef]);

  const displayControls = (
    <div className="flex shrink-0 items-center gap-1 [-webkit-app-region:no-drag]">
      <ToggleGroup
        className="shrink-0"
        variant="outline"
        size="xs"
        value={[diffRenderMode]}
        onValueChange={(value) => {
          const next = value[0];
          if (next === "stacked" || next === "split") {
            setDiffRenderMode(next);
          }
        }}
      >
        <Toggle aria-label="Stacked diff view" value="stacked">
          <Rows3Icon className="size-3" />
        </Toggle>
        <Toggle aria-label="Split diff view" value="split">
          <Columns2Icon className="size-3" />
        </Toggle>
      </ToggleGroup>
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              aria-label={wordWrap ? "Disable diff line wrapping" : "Enable diff line wrapping"}
              variant="outline"
              size="xs"
              pressed={wordWrap}
              onPressedChange={(pressed) => {
                setWordWrap(Boolean(pressed));
              }}
            />
          }
        >
          <TextWrapIcon className="size-3" />
        </TooltipTrigger>
        <TooltipPopup side="top">
          {wordWrap ? "Disable line wrapping" : "Enable line wrapping"}
        </TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              aria-label={
                diffIgnoreWhitespace ? "Show whitespace changes" : "Hide whitespace changes"
              }
              variant="outline"
              size="xs"
              pressed={diffIgnoreWhitespace}
              onPressedChange={(pressed) => {
                setDiffIgnoreWhitespace(Boolean(pressed));
              }}
            />
          }
        >
          <PilcrowIcon className="size-3" />
        </TooltipTrigger>
        <TooltipPopup side="top">
          {diffIgnoreWhitespace ? "Show whitespace changes" : "Hide whitespace changes"}
        </TooltipPopup>
      </Tooltip>
    </div>
  );

  const normalHeaderRow = (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-3 [-webkit-app-region:no-drag]">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex h-6 max-w-full items-center gap-1 rounded-md bg-muted/70 px-2 text-xs font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Diff scope: ${selectedScopeLabel}`}
          >
            <span className="truncate">{selectedScopeLabel}</span>
            <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuItem onClick={() => selectGitScope("unstaged")}>
              <span>Working tree</span>
              {selectedTurnId === null && selectedGitScope === "unstaged" && (
                <CheckIcon className="ml-auto" />
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => selectGitScope("branch")}>
              <span>Branch changes</span>
              {selectedTurnId === null && selectedGitScope === "branch" && (
                <CheckIcon className="ml-auto" />
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                if (latestTurn) selectTurn(latestTurn.turnId);
              }}
            >
              <span>Latest turn</span>
              {selectedTurnId !== null && selectedTurn?.turnId === latestTurn?.turnId && (
                <CheckIcon className="ml-auto" />
              )}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Turn</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-64">
                {orderedTurnDiffSummaries.map((summary) => {
                  const turnCount =
                    summary.checkpointTurnCount ??
                    inferredCheckpointTurnCountByTurnId[summary.turnId] ??
                    "?";
                  return (
                    <DropdownMenuItem
                      key={summary.turnId}
                      onClick={() => selectTurn(summary.turnId)}
                    >
                      <span>Turn {turnCount}</span>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {formatShortTimestamp(summary.completedAt, settings.timestampFormat)}
                      </span>
                      {summary.turnId === selectedTurn?.turnId && <CheckIcon className="ml-1" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
        {selectedTurnId === null && selectedGitScope === "branch" && selectedGitSource?.baseRef && (
          <div
            className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden text-xs text-muted-foreground"
            title={`${selectedGitSource.headRef ?? "HEAD"} → ${selectedGitSource.baseRef}`}
            aria-label={`Comparing ${selectedGitSource.headRef ?? "HEAD"} against ${selectedGitSource.baseRef}`}
          >
            <span className="min-w-0 max-w-48 truncate">{selectedGitSource.headRef ?? "HEAD"}</span>
            <ArrowRightIcon className="size-3.5 shrink-0 opacity-70" />
            <Combobox
              items={baseRefItems}
              filteredItems={filteredBaseRefItems}
              value={selectedBaseRef ?? AUTOMATIC_BASE_REF}
              onOpenChange={(open) => {
                if (!open) setBaseRefQuery("");
              }}
              onValueChange={(value) => {
                if (!value) return;
                selectBranchBaseRef(value === AUTOMATIC_BASE_REF ? null : value);
              }}
            >
              <ComboboxTrigger
                className="inline-flex min-w-0 max-w-48 items-center gap-1 overflow-hidden rounded-md px-1.5 py-1 outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Change comparison target. Currently ${selectedGitSource.baseRef}`}
              >
                <span className="min-w-0 truncate">{selectedGitSource.baseRef}</span>
                <ChevronDownIcon className="size-3.5 shrink-0 opacity-70" />
              </ComboboxTrigger>
              <ComboboxPopup
                align="start"
                className="w-72 min-w-0 max-w-[calc(100vw-1rem)] overflow-hidden [&>[data-slot=combobox-popup]]:min-w-0 [&>[data-slot=combobox-popup]]:overflow-hidden"
              >
                <div className="min-w-0 shrink-0 px-3 pt-2.5">
                  <div className="relative -translate-y-px border-b border-border/70 pb-1.5 transition-colors focus-within:border-ring">
                    <SearchIcon
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1.5 left-0 size-4 shrink-0 text-muted-foreground/55"
                    />
                    <ComboboxInput
                      className="[&_input]:h-6.5 [&_input]:ps-5 [&_input]:font-sans [&_input]:leading-6.5"
                      inputClassName="rounded-none bg-transparent text-sm"
                      placeholder="Search refs..."
                      showTrigger={false}
                      size="sm"
                      unstyled
                      value={baseRefQuery}
                      onChange={(event) => setBaseRefQuery(event.target.value)}
                    />
                  </div>
                </div>
                <div className="grid shrink-0 grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 border-b border-border/70 ps-3 pe-6.5 pt-2 pb-1.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                  <span aria-hidden="true" />
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_2rem] items-center">
                    <span>Branch</span>
                    <span className="text-right">Remote</span>
                  </div>
                </div>
                <ComboboxEmpty>No matching refs.</ComboboxEmpty>
                <ComboboxList className="max-h-64 min-w-0 overflow-x-hidden">
                  <ComboboxItem
                    className="h-8 w-full min-w-0 grid-cols-[1rem_minmax(0,1fr)] py-0"
                    contentClassName="w-full min-w-0 overflow-hidden"
                    value={AUTOMATIC_BASE_REF}
                  >
                    <span className="block min-w-0 truncate">Automatic</span>
                  </ComboboxItem>
                  {baseRefChoices.map((choice) => {
                    const item = valueForBaseRefChoice(choice);
                    const hasBoth = choice.local !== null && choice.remote !== null;
                    const useRemote = choice.remote?.name === item;
                    return (
                      <ComboboxItem
                        key={choice.id}
                        className="h-8 w-full min-w-0 grid-cols-[1rem_minmax(0,1fr)] py-0"
                        contentClassName="w-full min-w-0 overflow-hidden"
                        value={item}
                      >
                        <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_2rem] items-center overflow-hidden">
                          <span className="block min-w-0 truncate pe-2">{choice.label}</span>
                          {hasBoth ? (
                            <div
                              className="flex justify-end"
                              onClick={(event) => event.stopPropagation()}
                              onPointerDown={(event) => event.stopPropagation()}
                            >
                              <Switch
                                aria-label={`Use remote version of ${choice.label}`}
                                checked={useRemote}
                                className="[--thumb-size:--spacing(3)]"
                                onCheckedChange={(checked) => {
                                  const nextRef = checked
                                    ? choice.remote?.name
                                    : choice.local?.name;
                                  if (nextRef) selectBranchBaseRef(nextRef);
                                }}
                              />
                            </div>
                          ) : choice.remote ? (
                            <span
                              className="flex justify-end text-muted-foreground"
                              title="Remote only"
                            >
                              <CheckIcon aria-hidden="true" className="size-3" />
                            </span>
                          ) : null}
                        </div>
                      </ComboboxItem>
                    );
                  })}
                </ComboboxList>
              </ComboboxPopup>
            </Combobox>
          </div>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-55 [-webkit-app-region:no-drag]"
              disabled={!activeThread || !activeCwd || reviewActionPending !== null}
              onClick={handleOpenReview}
            >
              <FileSearchIcon className="size-3" />
              <span>Review</span>
            </button>
          }
        />
        <TooltipPopup side="top">Generate review snapshot</TooltipPopup>
      </Tooltip>
      {displayControls}
    </>
  );

  const reviewHeaderRow = (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-2 [-webkit-app-region:no-drag]">
        <span className="inline-flex h-6 shrink-0 items-center rounded-md bg-muted/70 px-2 text-xs font-medium text-foreground">
          Review
        </span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {reviewSnapshot?.source.title ?? "Loading review..."}
        </span>
        {reviewSnapshot ? (
          <>
            <span className="rounded-sm border border-border/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
              {reviewSnapshot.status}
            </span>
            <span
              className={cn(
                "rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase",
                reviewSnapshot.freshness === "stale"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300"
                  : "border-border/70 text-muted-foreground",
              )}
            >
              {reviewSnapshot.freshness}
            </span>
          </>
        ) : null}
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55 [-webkit-app-region:no-drag]"
              disabled={!reviewId || reviewActionPending !== null}
              aria-label="Refresh review"
              onClick={handleRefreshReview}
            >
              <RefreshCwIcon
                className={cn("size-3", reviewActionPending === "refresh" && "animate-spin")}
              />
            </button>
          }
        />
        <TooltipPopup side="top">Refresh review</TooltipPopup>
      </Tooltip>
      {displayControls}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [-webkit-app-region:no-drag]"
              aria-label="Exit review"
              onClick={handleExitReview}
            >
              <XIcon className="size-3" />
            </button>
          }
        />
        <TooltipPopup side="top">Exit review</TooltipPopup>
      </Tooltip>
    </>
  );

  const headerRow = isReviewMode ? reviewHeaderRow : normalHeaderRow;

  return (
    <DiffPanelShell mode={mode} header={headerRow}>
      {!activeThread ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
          Select a thread to inspect turn diffs.
        </div>
      ) : !isReviewMode && !isGitRepo ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
          Turn diffs are unavailable because this project is not a git repository.
        </div>
      ) : !isReviewMode && selectedTurnId !== null && orderedTurnDiffSummaries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
          No completed turns yet.
        </div>
      ) : (
        <>
          <div className="diff-panel-viewport flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {reviewActionError && (
              <p className="shrink-0 border-b border-border/70 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-600 dark:text-red-300">
                {reviewActionError}
              </p>
            )}
            {isReviewMode && reviewSnapshot?.freshness === "stale" && (
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                <span>This review is stale because the selected diff changed.</span>
                <button
                  type="button"
                  className="rounded-sm border border-amber-500/30 px-1.5 py-0.5 font-medium hover:bg-amber-500/10"
                  onClick={handleRefreshReview}
                >
                  Refresh
                </button>
              </div>
            )}
            {isReviewMode && reviewSnapshot?.status === "pending" && (
              <p className="shrink-0 border-b border-border/70 bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
                Review generation is still running.
              </p>
            )}
            {isReviewMode && reviewSnapshot?.status === "failed" && (
              <p className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-600 dark:text-red-300">
                {reviewSnapshot.error?.message ?? "Review generation failed."}
              </p>
            )}
            {isSelectedPatchTruncated && (
              <p className="shrink-0 border-b border-border/70 bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
                {isReviewMode
                  ? "This review was generated from truncated diff content. Findings may be incomplete."
                  : "This diff was truncated because it exceeded the preview limit. The changes shown are incomplete."}
              </p>
            )}
            {isReviewMode && reviewSnapshot?.summary.trim() ? (
              <div className="shrink-0 border-b border-border/70 bg-background px-3 py-2 text-xs text-foreground">
                {reviewSnapshot.summary}
              </div>
            ) : null}
            {selectedPatchError && !renderablePatch && (
              <div className="px-3">
                <p className="mb-2 text-[11px] text-red-500/80">{selectedPatchError}</p>
              </div>
            )}
            {!renderablePatch ? (
              isLoadingSelectedPatch ? (
                <DiffPanelLoadingState
                  label={
                    isReviewMode
                      ? "Loading review snapshot..."
                      : selectedTurn
                        ? "Loading checkpoint diff..."
                        : selectedGitScope === "unstaged"
                          ? "Loading working tree diff..."
                          : "Loading branch diff..."
                  }
                />
              ) : (
                <div className="flex h-full items-center justify-center px-3 py-2 text-xs text-muted-foreground/70">
                  <p>
                    {hasNoNetChanges
                      ? "No net changes in this selection."
                      : "No patch available for this selection."}
                  </p>
                </div>
              )
            ) : renderablePatch.kind === "files" ? (
              <div
                className={cn(
                  "diff-panel-file-layout",
                  codeViewFiles.length > 1 && "diff-panel-file-layout-with-nav",
                )}
              >
                {codeViewFiles.length > 1 ? (
                  <DiffFileNavigator
                    activeFileKey={activeNavigatorFileKey}
                    files={codeViewFiles}
                    reviewFileContextByPath={reviewFileContextByPath}
                    resolvedTheme={resolvedTheme}
                    onSelectFile={scrollToDiffFile}
                  />
                ) : null}
                <div
                  className="min-h-0 min-w-0"
                  onClickCapture={(event) => {
                    const composedPath = event.nativeEvent.composedPath?.() ?? [];
                    const title = composedPath.find(
                      (node): node is HTMLElement =>
                        node instanceof HTMLElement && node.hasAttribute("data-title"),
                    );
                    const filePath = title?.textContent?.trim();
                    if (filePath) openDiffFile(filePath);
                  }}
                >
                  <AnnotatableCodeView
                    viewerRef={codeViewRef}
                    key={collapseScopeKey ?? reviewSectionId}
                    className="diff-render-surface h-full min-h-0 overflow-auto"
                    files={codeViewFiles}
                    sectionId={activeReviewSectionId}
                    sectionTitle={activeReviewSectionTitle}
                    composerDraftTarget={composerDraftTarget}
                    reviewFileContextByPath={reviewFileContextByPath}
                    reviewFindingsByFilePath={reviewFindingsByFilePath}
                    renderHeaderPrefix={(fileDiff, fileKey, collapsed) => {
                      const filePath = resolveFileDiffPath(fileDiff);
                      return (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                className={cn(
                                  "inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 transition-colors hover:bg-foreground/10 focus-visible:outline-hidden",
                                  getDiffCollapseIconClassName(fileDiff),
                                )}
                                aria-label={
                                  collapsed ? `Expand ${filePath}` : `Collapse ${filePath}`
                                }
                                aria-expanded={!collapsed}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleDiffFileCollapsed(fileKey);
                                }}
                              />
                            }
                          >
                            {collapsed ? (
                              <ChevronRightIcon className="size-4" />
                            ) : (
                              <ChevronDownIcon className="size-4" />
                            )}
                          </TooltipTrigger>
                          <TooltipPopup side="top">
                            {collapsed ? "Expand diff" : "Collapse diff"}
                          </TooltipPopup>
                        </Tooltip>
                      );
                    }}
                    options={{
                      diffStyle: diffRenderMode === "split" ? "split" : "unified",
                      lineDiffType: "none",
                      overflow: wordWrap ? "wrap" : "scroll",
                      theme: resolveDiffThemeName(resolvedTheme),
                      themeType: resolvedTheme as DiffThemeType,
                      unsafeCSS: DIFF_PANEL_UNSAFE_CSS,
                      stickyHeaders: true,
                      layout: { paddingTop: 8, paddingBottom: 8, gap: 8 },
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto p-2">
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground/75">{renderablePatch.reason}</p>
                  <pre
                    className={cn(
                      "max-h-[72vh] rounded-md border border-border/70 bg-background/70 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground/90",
                      wordWrap
                        ? "overflow-auto whitespace-pre-wrap wrap-break-word"
                        : "overflow-auto",
                    )}
                  >
                    {renderablePatch.text}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </DiffPanelShell>
  );
}

function DiffFileNavigator({
  activeFileKey,
  files,
  reviewFileContextByPath,
  resolvedTheme,
  onSelectFile,
}: {
  activeFileKey: string | null;
  files: ReadonlyArray<DiffCodeViewFile>;
  reviewFileContextByPath: ReadonlyMap<string, ReviewFileContext>;
  resolvedTheme: "light" | "dark";
  onSelectFile: (fileKey: string) => void;
}) {
  const filesByPath = useMemo(() => new Map(files.map((file) => [file.filePath, file])), [files]);
  const summaryStat = useMemo(
    () =>
      files.reduce(
        (acc, file) => {
          const stat = summarizeFileDiffStats(file.fileDiff);
          return {
            additions: acc.additions + stat.additions,
            deletions: acc.deletions + stat.deletions,
          };
        },
        { additions: 0, deletions: 0 },
      ),
    [files],
  );
  const treeNodes = useMemo(
    () =>
      buildTurnDiffTree(
        files.map((file) => {
          const stat = summarizeFileDiffStats(file.fileDiff);
          return {
            path: file.filePath,
            kind: file.fileDiff.type,
            additions: stat.additions,
            deletions: stat.deletions,
          };
        }),
      ),
    [files],
  );
  const directoryPathsKey = useMemo(
    () => collectDiffNavigatorDirectoryPaths(treeNodes).join("\u0000"),
    [treeNodes],
  );
  const [collapsedDirectoryPaths, setCollapsedDirectoryPaths] = useState<{
    key: string;
    paths: ReadonlySet<string>;
  }>(() => ({ key: directoryPathsKey, paths: new Set() }));
  const collapsedPaths =
    collapsedDirectoryPaths.key === directoryPathsKey
      ? collapsedDirectoryPaths.paths
      : new Set<string>();
  const toggleDirectory = useCallback(
    (path: string) => {
      setCollapsedDirectoryPaths((current) => {
        const next = new Set(current.key === directoryPathsKey ? current.paths : []);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return { key: directoryPathsKey, paths: next };
      });
    },
    [directoryPathsKey],
  );

  const renderNode = (node: TurnDiffTreeNode, depth: number) => {
    const leftPadding = 8 + depth * 18;
    if (node.kind === "directory") {
      const isExpanded = !collapsedPaths.has(node.path);
      return (
        <div key={`dir:${node.path}`} className="space-y-0.5">
          <button
            type="button"
            className="grid w-full min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md py-1 pr-2 text-left text-muted-foreground/75 transition-colors hover:bg-accent/45 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
            style={{ paddingLeft: `${leftPadding}px` }}
            aria-expanded={isExpanded}
            onClick={() => toggleDirectory(node.path)}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <ChevronRightIcon
                className={cn("size-3.5 shrink-0 transition-transform", isExpanded && "rotate-90")}
              />
              {isExpanded ? (
                <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/65" />
              ) : (
                <FolderClosedIcon className="size-3.5 shrink-0 text-muted-foreground/65" />
              )}
              <span className="truncate font-mono text-[11px] leading-4">{node.name}</span>
            </span>
            {hasNonZeroStat(node.stat) ? (
              <DiffStatLabel
                additions={node.stat.additions}
                deletions={node.stat.deletions}
                className="text-[10px] leading-4"
              />
            ) : null}
          </button>
          {isExpanded ? node.children.map((child) => renderNode(child, depth + 1)) : null}
        </div>
      );
    }

    const file = filesByPath.get(node.path);
    if (!file) return null;
    const isActive = file.fileKey === activeFileKey;
    const stat = node.stat ?? summarizeFileDiffStats(file.fileDiff);
    const reviewFile = reviewFileContextByPath.get(file.filePath);
    const findingCount = reviewFile?.findings.length ?? 0;
    const highestSeverity = getHighestReviewFindingSeverity(reviewFile?.findings ?? []);

    return (
      <button
        key={`file:${node.path}`}
        type="button"
        className={cn(
          "grid w-full min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md py-1.5 pr-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
          isActive
            ? "bg-accent/70 text-foreground"
            : "text-muted-foreground hover:bg-accent/45 hover:text-foreground",
        )}
        style={{ paddingLeft: `${leftPadding}px` }}
        aria-current={isActive ? "true" : undefined}
        title={file.filePath}
        onClick={() => onSelectFile(file.fileKey)}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <PierreEntryIcon
            pathValue={file.filePath}
            kind="file"
            theme={resolvedTheme}
            className="size-3.5"
          />
          <span className="truncate font-mono text-[11px] leading-4">{node.name}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          {findingCount > 0 && highestSeverity ? (
            <span
              className={cn(
                "rounded-sm border px-1 py-0.5 text-[10px] leading-none font-medium tabular-nums",
                reviewSeverityClassName(highestSeverity),
              )}
              title={`${findingCount} review finding${findingCount === 1 ? "" : "s"}`}
            >
              {findingCount}
            </span>
          ) : null}
          {hasNonZeroStat(stat) ? (
            <DiffStatLabel
              additions={stat.additions}
              deletions={stat.deletions}
              className="text-[10px] leading-4"
            />
          ) : (
            <span className="font-mono text-[10px] text-muted-foreground/65">
              {formatDiffChangeType(file.fileDiff.type)}
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <nav className="diff-panel-file-navigator" aria-label="Changed files">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border/60 bg-background/95 px-2.5 py-2 backdrop-blur">
        <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-medium tracking-[0.12em] text-muted-foreground/70 uppercase">
          <span className="truncate">Changed files ({files.length})</span>
          {hasNonZeroStat(summaryStat) ? (
            <>
              <span>·</span>
              <DiffStatLabel
                additions={summaryStat.additions}
                deletions={summaryStat.deletions}
                className="text-[10px] tracking-normal"
                layout="inline"
              />
            </>
          ) : null}
        </span>
      </div>
      <div className="space-y-0.5 p-1.5">{treeNodes.map((node) => renderNode(node, 0))}</div>
    </nav>
  );
}

function reviewSeverityRank(severity: ReviewFinding["severity"]): number {
  switch (severity) {
    case "critical":
      return 4;
    case "major":
      return 3;
    case "minor":
      return 2;
    case "info":
      return 1;
  }
}

function getHighestReviewFindingSeverity(
  findings: ReadonlyArray<ReviewFinding>,
): ReviewFinding["severity"] | null {
  return (
    findings.toSorted(
      (left, right) => reviewSeverityRank(right.severity) - reviewSeverityRank(left.severity),
    )[0]?.severity ?? null
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

function formatDiffChangeType(type: FileDiffMetadata["type"]): string {
  switch (type) {
    case "new":
      return "new";
    case "deleted":
      return "deleted";
    case "rename-pure":
      return "renamed";
    case "rename-changed":
      return "renamed";
    case "change":
      return "changed";
  }
}

function collectDiffNavigatorDirectoryPaths(nodes: ReadonlyArray<TurnDiffTreeNode>): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.kind !== "directory") continue;
    paths.push(node.path);
    paths.push(...collectDiffNavigatorDirectoryPaths(node.children));
  }
  return paths;
}
