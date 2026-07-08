import { useAtomValue } from "@effect/atom-react";
import { useParams } from "@tanstack/react-router";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { safeErrorLogAttributes } from "@t3tools/client-runtime/errors";
import type {
  ReviewDiffPreviewResult,
  ReviewDiffPreviewSource,
  ReviewFileContext,
  ReviewFinding,
  ScopedThreadRef,
  TurnId,
} from "@t3tools/contracts";
import { REVIEW_DIFF_PREVIEW_MAX_OUTPUT_BYTES } from "@t3tools/contracts";
import type { FileDiffMetadata } from "@pierre/diffs";
import {
  ArrowRightIcon,
  BookOpenTextIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Columns2Icon,
  CopyIcon,
  FolderClosedIcon,
  FolderIcon,
  MessageSquareIcon,
  PilcrowIcon,
  Rows3Icon,
  SearchIcon,
  TextWrapIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOpenInPreferredEditor } from "../editorPreferences";
import { type DraftId } from "../composerDraftStore";
import { openDiffFilePrimaryAction } from "../diffFileActions";
import { useCheckpointDiff } from "~/lib/checkpointDiffState";
import { cn } from "~/lib/utils";
import type {
  InteractiveReviewTour,
  InteractiveReviewTourAnchor,
  InteractiveReviewTourStep,
} from "~/lib/interactiveReviewTour";
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
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogDescription, DialogHeader, DialogPopup, DialogTitle } from "./ui/dialog";
import { useEnvironmentQuery } from "../state/query";
import { serverEnvironment } from "../state/server";
import { reviewEnvironment } from "../state/review";
import { vcsEnvironment } from "../state/vcs";
import { buildBaseRefChoices, filterBaseRefChoices } from "../lib/baseRefChoices";

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
const EMPTY_REVIEW_FILE_CONTEXT: ReadonlyMap<string, ReviewFileContext> = new Map();
const EMPTY_REVIEW_FINDINGS: ReadonlyMap<string, ReadonlyArray<ReviewFinding>> = new Map();

function collectTourStepFilePaths(step: InteractiveReviewTourStep): string[] {
  return Array.from(new Set([...step.files, ...step.anchors.map((anchor) => anchor.filePath)]));
}

function formatTourAnchorRange(anchor: InteractiveReviewTourAnchor): string {
  if (anchor.rangeLabel) return anchor.rangeLabel;
  if (anchor.startLine === null) return "";
  return anchor.endLine && anchor.endLine !== anchor.startLine
    ? `${anchor.startLine}-${anchor.endLine}`
    : `${anchor.startLine}`;
}

function sameReviewDiffPreviewContent(
  left: ReviewDiffPreviewResult,
  right: ReviewDiffPreviewResult,
): boolean {
  if (left.cwd !== right.cwd || left.sources.length !== right.sources.length) return false;
  return left.sources.every((leftSource, index) => {
    const rightSource = right.sources[index];
    return (
      rightSource !== undefined &&
      leftSource.id === rightSource.id &&
      leftSource.kind === rightSource.kind &&
      leftSource.title === rightSource.title &&
      leftSource.baseRef === rightSource.baseRef &&
      leftSource.headRef === rightSource.headRef &&
      leftSource.diff === rightSource.diff &&
      leftSource.diffHash === rightSource.diffHash &&
      leftSource.truncated === rightSource.truncated
    );
  });
}

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
  interactiveReviewTour?: InteractiveReviewTour | null;
  onAskInteractiveReviewStep?: (step: InteractiveReviewTourStep, text: string) => void;
}

export { DiffWorkerPoolProvider } from "./DiffWorkerPoolProvider";

export default function DiffPanel({
  mode = "inline",
  composerDraftTarget,
  interactiveReviewTour = null,
  onAskInteractiveReviewStep,
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
  const [activeTourStepId, setActiveTourStepId] = useState<string | null>(null);
  const [isTourPanelCollapsed, setTourPanelCollapsed] = useState(false);
  const [fullDiffDialogOpen, setFullDiffDialogOpen] = useState(false);
  const codeViewRef = useRef<AnnotatableCodeViewHandle>(null);

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
  const tourSteps = interactiveReviewTour?.steps ?? [];
  const activeTourStep =
    tourSteps.find((step) => step.id === activeTourStepId) ?? tourSteps[0] ?? null;
  const activeTourStepFilePaths = useMemo(
    () => (activeTourStep ? collectTourStepFilePaths(activeTourStep) : []),
    [activeTourStep],
  );
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

  useEffect(() => {
    setActiveTourStepId(interactiveReviewTour?.steps[0]?.id ?? null);
    setTourPanelCollapsed(false);
  }, [interactiveReviewTour?.sourceMessageId, interactiveReviewTour?.steps]);

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
  const activeReviewSectionId = reviewSectionId;
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
  const activeReviewSectionTitle = reviewSectionTitle;
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
  const branchDiffPreview = primaryBranchDiffPreview;
  const branchDiffPreviewKey =
    selectedTurnId === null && activeThread && activeCwd
      ? [
          activeThread.environmentId,
          activeCwd,
          selectedBaseRef ?? "",
          diffIgnoreWhitespace ? "ignore-whitespace" : "include-whitespace",
        ].join("\u0000")
      : null;
  const [stableBranchDiffPreview, setStableBranchDiffPreview] = useState<{
    readonly key: string;
    readonly data: ReviewDiffPreviewResult;
  } | null>(null);
  useEffect(() => {
    if (!branchDiffPreviewKey) {
      setStableBranchDiffPreview(null);
      return;
    }
    const previewData = branchDiffPreview.data;
    if (previewData) {
      setStableBranchDiffPreview((current) =>
        current?.key === branchDiffPreviewKey &&
        sameReviewDiffPreviewContent(current.data, previewData)
          ? current
          : { key: branchDiffPreviewKey, data: previewData },
      );
    }
  }, [branchDiffPreview.data, branchDiffPreviewKey]);
  const stableBranchDiffPreviewData =
    stableBranchDiffPreview?.key === branchDiffPreviewKey ? stableBranchDiffPreview.data : null;
  const branchDiffPreviewData =
    branchDiffPreview.data && stableBranchDiffPreviewData
      ? sameReviewDiffPreviewContent(stableBranchDiffPreviewData, branchDiffPreview.data)
        ? stableBranchDiffPreviewData
        : branchDiffPreview.data
      : (branchDiffPreview.data ?? stableBranchDiffPreviewData);
  const selectedGitSourceKind =
    selectedGitScope === "unstaged" ? ("working-tree" as const) : ("branch-range" as const);
  const selectedGitSource = branchDiffPreviewData?.sources.find(
    (source) => source.kind === selectedGitSourceKind,
  );
  const fullDiffPreview = useEnvironmentQuery(
    fullDiffDialogOpen && selectedTurnId === null && activeThread && activeCwd
      ? reviewEnvironment.diffPreview({
          environmentId: activeThread.environmentId,
          input: {
            cwd: activeCwd,
            ...(selectedBaseRef ? { baseRef: selectedBaseRef } : {}),
            ignoreWhitespace: diffIgnoreWhitespace,
            maxOutputBytes: REVIEW_DIFF_PREVIEW_MAX_OUTPUT_BYTES,
          },
        })
      : null,
  );
  const fullDiffSource = fullDiffPreview.data?.sources.find(
    (source) => source.kind === selectedGitSourceKind,
  );
  const tourFallbackGitSource = interactiveReviewTour
    ? branchDiffPreviewData?.sources.find(
        (source) => source.kind !== selectedGitSourceKind && source.diff.trim().length > 0,
      )
    : undefined;
  useEffect(() => {
    if (
      !routeThreadRef ||
      selectedTurnId !== null ||
      !interactiveReviewTour ||
      selectedGitSource?.diff.trim() ||
      !tourFallbackGitSource
    ) {
      return;
    }
    useDiffPanelStore
      .getState()
      .selectGitScope(
        routeThreadRef,
        tourFallbackGitSource.kind === "working-tree" ? "unstaged" : "branch",
      );
  }, [
    interactiveReviewTour,
    routeThreadRef,
    selectedGitSource?.diff,
    selectedTurnId,
    tourFallbackGitSource,
  ]);
  const selectedGitSourceForRefs = branchDiffPreviewData?.sources.find(
    (source) => source.kind === (selectedGitScope === "unstaged" ? "working-tree" : "branch-range"),
  );
  const localBranchRefs = useEnvironmentQuery(
    selectedTurnId === null &&
      selectedGitScope === "branch" &&
      activeThread &&
      branchDiffPreviewData?.cwd
      ? vcsEnvironment.listRefs({
          environmentId: activeThread.environmentId,
          input: {
            cwd: branchDiffPreviewData.cwd,
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
      branchDiffPreviewData?.cwd
      ? vcsEnvironment.listRefs({
          environmentId: activeThread.environmentId,
          input: {
            cwd: branchDiffPreviewData.cwd,
            includeMatchingRemoteRefs: true,
            refKind: "remote",
            ...(baseRefQuery.trim().length > 0 ? { query: baseRefQuery.trim() } : {}),
            limit: 100,
          },
        })
      : null,
  );
  const baseRefChoices = buildBaseRefChoices(
    localBranchRefs.data?.refs.filter((ref) => ref.name !== selectedGitSourceForRefs?.headRef) ??
      [],
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
  const selectedPatch = liveSelectedPatch;
  const isSelectedPatchTruncated = liveSelectedPatchTruncated;
  const hasResolvedPatch = typeof selectedPatch === "string";
  const isLoadingSelectedPatch = !hasResolvedPatch && liveSelectedPatchLoading;
  const selectedPatchError = hasResolvedPatch ? null : liveSelectedPatchError;
  const hasNoNetChanges = hasResolvedPatch && selectedPatch.trim().length === 0;
  const renderablePatch = useMemo(
    () =>
      getRenderablePatch(selectedPatch, `diff-panel:${resolvedTheme}`, {
        compactPartialHunkOffsets: selectedTurnId === null,
      }),
    [resolvedTheme, selectedPatch, selectedTurnId],
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
  const allCodeViewFiles = useMemo<DiffCodeViewFile[]>(
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
  const codeViewFiles = useMemo<DiffCodeViewFile[]>(() => {
    if (!activeTourStep || activeTourStepFilePaths.length === 0) {
      return allCodeViewFiles;
    }
    const filePathSet = new Set(activeTourStepFilePaths);
    const scopedFiles = allCodeViewFiles.filter((file) => filePathSet.has(file.filePath));
    if (scopedFiles.length === 0) return allCodeViewFiles;
    const order = new Map(activeTourStepFilePaths.map((filePath, index) => [filePath, index]));
    return scopedFiles
      .toSorted(
        (left, right) =>
          (order.get(left.filePath) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(right.filePath) ?? Number.MAX_SAFE_INTEGER),
      )
      .map((file) => ({ ...file, collapsed: false }));
  }, [activeTourStep, activeTourStepFilePaths, allCodeViewFiles]);
  const reviewFileContextByPath = EMPTY_REVIEW_FILE_CONTEXT;
  const reviewFindingsByFilePath = EMPTY_REVIEW_FINDINGS;
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
    setFullDiffDialogOpen(false);
  }, [collapseScopeKey, diffIgnoreWhitespace, selectedBaseRef, selectedGitScope, selectedTurnId]);

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
  const scrollToDiffFilePath = useCallback(
    (filePath: string) => {
      const file =
        codeViewFiles.find((candidate) => candidate.filePath === filePath) ??
        allCodeViewFiles.find((candidate) => candidate.filePath === filePath);
      if (file) scrollToDiffFile(file.fileKey);
    },
    [allCodeViewFiles, codeViewFiles, scrollToDiffFile],
  );

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
      {displayControls}
    </>
  );

  return (
    <DiffPanelShell mode={mode} header={normalHeaderRow}>
      {!activeThread ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
          Select a thread to inspect turn diffs.
        </div>
      ) : !isGitRepo ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
          Turn diffs are unavailable because this project is not a git repository.
        </div>
      ) : selectedTurnId !== null && orderedTurnDiffSummaries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
          No completed turns yet.
        </div>
      ) : (
        <>
          <div className="diff-panel-viewport flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {isSelectedPatchTruncated && (
              <div className="flex shrink-0 items-center gap-3 border-b border-border/70 bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
                <p className="min-w-0 flex-1">
                  This diff was truncated because it exceeded the preview limit. The changes shown
                  are incomplete.
                </p>
                {selectedTurnId === null ? (
                  <Button
                    size="xs"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => setFullDiffDialogOpen(true)}
                  >
                    View full diff
                  </Button>
                ) : null}
              </div>
            )}
            {interactiveReviewTour && activeTourStep ? (
              <InteractiveReviewTourPanel
                tour={interactiveReviewTour}
                activeStep={activeTourStep}
                activeStepIndex={tourSteps.findIndex((step) => step.id === activeTourStep.id)}
                onSelectStep={setActiveTourStepId}
                onSelectFile={scrollToDiffFilePath}
                onAskStep={onAskInteractiveReviewStep}
                collapsed={isTourPanelCollapsed}
                onCollapsedChange={setTourPanelCollapsed}
              />
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
                    selectedTurn
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
          <FullDiffDialog
            open={fullDiffDialogOpen}
            title={selectedScopeLabel}
            source={fullDiffSource ?? null}
            fallbackSource={selectedGitSource ?? null}
            isLoading={fullDiffPreview.isPending}
            error={fullDiffPreview.error}
            onOpenChange={setFullDiffDialogOpen}
          />
        </>
      )}
    </DiffPanelShell>
  );
}

function formatByteCount(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function FullDiffDialog({
  open,
  title,
  source,
  fallbackSource,
  isLoading,
  error,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  source: ReviewDiffPreviewSource | null;
  fallbackSource: ReviewDiffPreviewSource | null;
  isLoading: boolean;
  error: unknown;
  onOpenChange: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const activeSource = source ?? fallbackSource;
  const diff = activeSource?.diff ?? "";
  const byteCount = useMemo(() => new TextEncoder().encode(diff).byteLength, [diff]);

  useEffect(() => {
    setCopied(false);
  }, [diff, open]);

  const copyDiff = useCallback(() => {
    if (!diff || typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(diff).then(() => setCopied(true));
  }, [diff]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="h-[min(85vh,900px)] max-w-5xl overflow-hidden">
        <DialogHeader className="border-b border-border/70 bg-background px-4 py-3">
          <div className="flex min-w-0 items-center gap-3 pr-8">
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base leading-5">Full diff</DialogTitle>
              <DialogDescription className="mt-1 truncate text-xs">
                {title}
                {activeSource ? ` · ${activeSource.title}` : ""}
                {byteCount > 0 ? ` · ${formatByteCount(byteCount)}` : ""}
              </DialogDescription>
            </div>
            <Button
              size="xs"
              variant="outline"
              disabled={!diff}
              onClick={copyDiff}
              className="shrink-0"
            >
              {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </DialogHeader>
        {activeSource?.truncated ? (
          <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/8 px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
            This diff still exceeds the {formatByteCount(REVIEW_DIFF_PREVIEW_MAX_OUTPUT_BYTES)}
            full-diff limit. The visible text is incomplete.
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-auto bg-background">
          {isLoading && !source ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Loading full diff...
            </div>
          ) : error && !source ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-xs text-destructive">
              {error instanceof Error ? error.message : "Unable to load full diff."}
            </div>
          ) : diff.trim().length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No diff available.
            </div>
          ) : (
            <pre className="min-h-full overflow-visible p-4 font-mono text-[11px] leading-relaxed whitespace-pre text-foreground">
              {diff}
            </pre>
          )}
        </div>
      </DialogPopup>
    </Dialog>
  );
}

function InteractiveReviewTourPanel({
  tour,
  activeStep,
  activeStepIndex,
  onSelectStep,
  onSelectFile,
  onAskStep,
  collapsed,
  onCollapsedChange,
}: {
  tour: InteractiveReviewTour;
  activeStep: InteractiveReviewTourStep;
  activeStepIndex: number;
  onSelectStep: (stepId: string) => void;
  onSelectFile: (filePath: string) => void;
  onAskStep: ((step: InteractiveReviewTourStep, text: string) => void) | undefined;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const safeStepIndex = Math.max(0, activeStepIndex);
  const previousStep = tour.steps[safeStepIndex - 1] ?? null;
  const nextStep = tour.steps[safeStepIndex + 1] ?? null;
  const [questionDraft, setQuestionDraft] = useState("");
  const [questionOpen, setQuestionOpen] = useState(false);

  useEffect(() => {
    setQuestionDraft("");
    setQuestionOpen(false);
  }, [activeStep.id]);

  const submitQuestion = () => {
    const text = questionDraft.trim();
    if (!text || !onAskStep) return;
    onAskStep(activeStep, text);
    setQuestionDraft("");
    setQuestionOpen(false);
  };

  return (
    <div className="shrink-0 border-b border-border bg-background">
      <div className="flex min-w-0 items-start gap-3 px-3 py-3">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/45 text-muted-foreground">
          <BookOpenTextIcon className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="min-w-0 space-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                Step {safeStepIndex + 1} of {tour.steps.length}
              </span>
              <span className="text-[10px] text-muted-foreground/70">•</span>
              <span className="rounded-sm border border-border/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
                {activeStep.kind}
              </span>
              <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                {tour.title}
              </span>
            </div>
            <h3
              className="truncate text-sm leading-5 font-semibold text-foreground"
              title={activeStep.title}
            >
              {activeStep.title}
            </h3>
          </div>
          <div
            aria-hidden={collapsed}
            className={cn(
              "grid min-w-0 overflow-hidden transition-[grid-template-rows,opacity,margin-top] duration-200 ease-out motion-reduce:transition-none",
              collapsed ? "mt-0 grid-rows-[0fr] opacity-0" : "mt-2 grid-rows-[1fr] opacity-100",
            )}
          >
            <div className={cn("min-h-0 overflow-hidden", collapsed && "pointer-events-none")}>
              <div className="interactive-review-tour-body grid min-w-0 gap-3">
                <div className="min-w-0 space-y-1.5">
                  <p className="text-sm leading-relaxed text-foreground/85">{activeStep.body}</p>
                  {activeStep.whyThisMatters ? (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      <span className="font-medium text-foreground/80">Why it matters: </span>
                      {activeStep.whyThisMatters}
                    </p>
                  ) : null}
                </div>
                <div className="min-w-0 space-y-2 text-xs">
                  {activeStep.files.length > 0 ? (
                    <div className="min-w-0">
                      <p className="mb-1 text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                        Step files
                      </p>
                      <div className="flex min-w-0 flex-wrap gap-1">
                        {activeStep.files.map((filePath) => (
                          <button
                            key={filePath}
                            type="button"
                            className="max-w-full truncate rounded-sm border border-border/70 bg-muted/35 px-1.5 py-0.5 font-mono text-[11px] text-foreground/85 hover:bg-muted"
                            tabIndex={collapsed ? -1 : undefined}
                            onClick={() => onSelectFile(filePath)}
                          >
                            {filePath}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {activeStep.anchors.length > 0 ? (
                    <div className="min-w-0">
                      <p className="mb-1 text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                        Code notes
                      </p>
                      <div className="space-y-1">
                        {activeStep.anchors.map((anchor) => {
                          const range = formatTourAnchorRange(anchor);
                          return (
                            <button
                              key={`${anchor.filePath}:${range}:${anchor.note ?? ""}`}
                              type="button"
                              className="block w-full rounded-sm border border-border/70 bg-muted/20 px-2 py-1 text-left hover:bg-muted/45"
                              tabIndex={collapsed ? -1 : undefined}
                              onClick={() => onSelectFile(anchor.filePath)}
                            >
                              <span className="block truncate font-mono text-[11px] text-foreground/85">
                                {anchor.filePath}
                                {range ? ` ${range}` : ""}
                              </span>
                              {anchor.note ? (
                                <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                                  {anchor.note}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              {activeStep.questions.length > 0 || activeStep.alternatives.length > 0 ? (
                <div className="interactive-review-tour-discussion grid gap-2 border-t border-border/60 pt-2 text-xs">
                  {activeStep.questions.length > 0 ? (
                    <div>
                      <p className="mb-1 text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                        Questions
                      </p>
                      <ul className="space-y-1 text-muted-foreground">
                        {activeStep.questions.map((question) => (
                          <li key={question}>{question}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {activeStep.alternatives.length > 0 ? (
                    <div>
                      <p className="mb-1 text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                        Alternatives
                      </p>
                      <ul className="space-y-1 text-muted-foreground">
                        {activeStep.alternatives.map((alternative) => (
                          <li key={alternative}>{alternative}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {questionOpen && onAskStep ? (
                <div className="mt-3 rounded-md border border-border/70 bg-muted/20 p-2.5">
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
                    <MessageSquareIcon className="size-3.5 text-muted-foreground" />
                    <span>Ask about this step</span>
                  </div>
                  <Textarea
                    autoFocus
                    size="sm"
                    value={questionDraft}
                    placeholder="Type a question"
                    aria-label="Question about this review step"
                    onChange={(event) => setQuestionDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setQuestionDraft("");
                        setQuestionOpen(false);
                      }
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                        event.preventDefault();
                        submitQuestion();
                      }
                    }}
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setQuestionDraft("");
                        setQuestionOpen(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" disabled={!questionDraft.trim()} onClick={submitQuestion}>
                      Add to chat
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-expanded={!collapsed}
                  aria-label={collapsed ? "Expand walkthrough" : "Collapse walkthrough"}
                  onClick={() => onCollapsedChange(!collapsed)}
                >
                  <ChevronDownIcon
                    className={cn("size-3.5 transition-transform", collapsed && "-rotate-90")}
                  />
                </button>
              }
            />
            <TooltipPopup>{collapsed ? "Expand walkthrough" : "Collapse walkthrough"}</TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={!previousStep}
                  aria-label="Previous tour step"
                  onClick={() => {
                    if (previousStep) onSelectStep(previousStep.id);
                  }}
                >
                  <ChevronRightIcon className="size-3.5 rotate-180" />
                </button>
              }
            />
            <TooltipPopup>Previous step</TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={!nextStep}
                  aria-label="Next tour step"
                  onClick={() => {
                    if (nextStep) onSelectStep(nextStep.id);
                  }}
                >
                  <ChevronRightIcon className="size-3.5" />
                </button>
              }
            />
            <TooltipPopup>Next step</TooltipPopup>
          </Tooltip>
          {onAskStep ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground hover:bg-muted"
                    onClick={() => {
                      onCollapsedChange(false);
                      setQuestionOpen(true);
                    }}
                  >
                    <MessageSquareIcon className="size-3.5" />
                    <span>Ask</span>
                  </button>
                }
              />
              <TooltipPopup>Ask about this step in chat</TooltipPopup>
            </Tooltip>
          ) : null}
        </div>
      </div>
    </div>
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
