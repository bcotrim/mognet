import type { MessageId } from "@t3tools/contracts";

export const INTERACTIVE_REVIEW_TOUR_LANGUAGE = "interactive-review-tour-json";

export type InteractiveReviewTourStepKind =
  | "overview"
  | "architecture"
  | "data-flow"
  | "integration"
  | "testing"
  | "tradeoff"
  | "quirk"
  | "question"
  | "nitpick";

export interface InteractiveReviewTourAnchor {
  readonly filePath: string;
  readonly startLine: number | null;
  readonly endLine: number | null;
  readonly rangeLabel: string | null;
  readonly note: string | null;
}

export interface InteractiveReviewTourStep {
  readonly id: string;
  readonly kind: InteractiveReviewTourStepKind;
  readonly title: string;
  readonly body: string;
  readonly whyThisMatters: string;
  readonly files: ReadonlyArray<string>;
  readonly anchors: ReadonlyArray<InteractiveReviewTourAnchor>;
  readonly questions: ReadonlyArray<string>;
  readonly alternatives: ReadonlyArray<string>;
}

export interface InteractiveReviewTour {
  readonly version: 1;
  readonly title: string;
  readonly summary: string;
  readonly sourceMessageId?: MessageId | undefined;
  readonly steps: ReadonlyArray<InteractiveReviewTourStep>;
}

interface BuildInteractiveReviewTourPromptInput {
  readonly userRequest: string;
  readonly projectTitle: string | null;
  readonly workspaceRoot: string | null;
  readonly worktreePath: string | null;
  readonly branch: string | null;
  readonly diffScopeLabel: string;
}

const TOUR_BLOCK_PATTERN =
  /```(?:interactive-review-tour-json|interactive_review_tour|code-tour-json)\s*([\s\S]*?)```/i;
const TOUR_TAG_PATTERN = /<interactive_review_tour>\s*([\s\S]*?)\s*<\/interactive_review_tour>/i;
const INTERACTIVE_REVIEW_PROMPT_PREFIX =
  "Run an interactive review of the current diff as a guided code tour.";

const STEP_KINDS: ReadonlySet<InteractiveReviewTourStepKind> = new Set([
  "overview",
  "architecture",
  "data-flow",
  "integration",
  "testing",
  "tradeoff",
  "quirk",
  "question",
  "nitpick",
]);

export function isInteractiveReviewRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return false;
  if (/^\/(?:interactive-review|tour)(?:\s|$)/.test(normalized)) return true;
  if (normalized === "interactive review" || normalized === "code tour") return true;
  if (normalized === "review this diff interactively") return true;
  return (
    /\binteractive review\b/.test(normalized) ||
    /\binteractive code review\b/.test(normalized) ||
    /\bcode tour\b/.test(normalized) ||
    /\btour (this|the) diff\b/.test(normalized)
  );
}

export function buildInteractiveReviewTourPrompt(input: BuildInteractiveReviewTourPromptInput) {
  const locationLines = [
    input.projectTitle ? `Project: ${input.projectTitle}` : null,
    input.workspaceRoot ? `Workspace root: ${input.workspaceRoot}` : null,
    input.worktreePath ? `Worktree: ${input.worktreePath}` : null,
    input.branch ? `Branch: ${input.branch}` : null,
    `Requested diff scope: ${input.diffScopeLabel}`,
  ].filter(Boolean);

  return [
    INTERACTIVE_REVIEW_PROMPT_PREFIX,
    "",
    "Use the interactive review behavior:",
    "- understand first, judgement second, nitpicks last",
    "- read the diff and the surrounding code needed to explain it",
    "- organize the walkthrough by architecture, dependency flow, and reviewer learning path",
    "- explain why each step matters and how the files fit the overall solution",
    "- ask useful questions and call out alternatives or tradeoffs",
    "- do not produce a bug-list style review unless a correctness issue is central to understanding the change",
    "",
    "Context:",
    ...locationLines.map((line) => `- ${line}`),
    input.userRequest.trim() ? `- User request: ${input.userRequest.trim()}` : null,
    "",
    "After your normal human-readable summary, emit exactly one final fenced code block using this language:",
    `\`\`\`${INTERACTIVE_REVIEW_TOUR_LANGUAGE}`,
    "{",
    '  "version": 1,',
    '  "title": "Short tour title",',
    '  "summary": "One or two sentences about the whole diff.",',
    '  "steps": [',
    "    {",
    '      "id": "stable-kebab-id",',
    '      "kind": "overview | architecture | data-flow | integration | testing | tradeoff | quirk | question | nitpick",',
    '      "title": "Step title",',
    '      "body": "What changed and what to understand.",',
    '      "whyThisMatters": "Why this matters for reviewing the code.",',
    '      "files": ["repo/relative/path.ts"],',
    '      "anchors": [',
    '        { "filePath": "repo/relative/path.ts", "startLine": 10, "endLine": 24, "rangeLabel": "10-24", "note": "Why this code part matters." }',
    "      ],",
    '      "questions": ["Question a reviewer should ask here"],',
    '      "alternatives": ["Alternative design or tradeoff to discuss"]',
    "    }",
    "  ]",
    "}",
    "```",
    "",
    "Artifact rules:",
    "- file paths must be repository-relative and must refer to changed files when possible",
    "- anchors should point to changed or nearby lines when you can identify useful locations",
    "- every changed file should appear in at least one step unless it is generated or irrelevant",
    "- keep step bodies concise enough to fit in a review sidebar",
    "- if a field does not apply, use an empty array or null",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function stripInteractiveReviewTourPrompt(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith(INTERACTIVE_REVIEW_PROMPT_PREFIX)) {
    return text;
  }
  const userRequest = /^- User request:\s*(.+)$/m.exec(trimmed)?.[1]?.trim();
  return userRequest && userRequest.length > 0 ? userRequest : "/interactive-review";
}

export function stripInteractiveReviewTourArtifact(text: string): string {
  return text
    .replace(TOUR_BLOCK_PATTERN, "")
    .replace(TOUR_TAG_PATTERN, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractInteractiveReviewTourFromText(
  text: string,
  sourceMessageId?: MessageId,
): InteractiveReviewTour | null {
  const jsonText = TOUR_BLOCK_PATTERN.exec(text)?.[1] ?? TOUR_TAG_PATTERN.exec(text)?.[1] ?? null;
  if (!jsonText) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  return parseInteractiveReviewTour(parsed, sourceMessageId);
}

function parseInteractiveReviewTour(
  value: unknown,
  sourceMessageId?: MessageId,
): InteractiveReviewTour | null {
  if (!isRecord(value)) return null;
  const title = stringValue(value.title).trim();
  const summary = stringValue(value.summary).trim();
  const rawSteps = Array.isArray(value.steps) ? value.steps : [];
  const steps = rawSteps.flatMap((step, index) => parseStep(step, index));
  if (steps.length === 0) return null;
  return {
    version: 1,
    title: title || "Interactive review",
    summary,
    ...(sourceMessageId ? { sourceMessageId } : {}),
    steps,
  };
}

function parseStep(value: unknown, index: number): InteractiveReviewTourStep[] {
  if (!isRecord(value)) return [];
  const title = stringValue(value.title).trim();
  const body = stringValue(value.body).trim();
  if (!title || !body) return [];
  const anchors = arrayValue(value.anchors).flatMap(parseAnchor);
  const files = uniqueStrings([
    ...arrayValue(value.files),
    ...anchors.map((anchor) => anchor.filePath),
  ]);
  const rawKind = stringValue(value.kind).trim();
  const kind = STEP_KINDS.has(rawKind as InteractiveReviewTourStepKind)
    ? (rawKind as InteractiveReviewTourStepKind)
    : "overview";

  return [
    {
      id: stringValue(value.id).trim() || slugForStep(title, index),
      kind,
      title,
      body,
      whyThisMatters: stringValue(value.whyThisMatters).trim(),
      files,
      anchors,
      questions: uniqueStrings(arrayValue(value.questions)),
      alternatives: uniqueStrings(arrayValue(value.alternatives)),
    },
  ];
}

function parseAnchor(value: unknown): InteractiveReviewTourAnchor[] {
  if (!isRecord(value)) return [];
  const filePath = stringValue(value.filePath).trim();
  if (!filePath) return [];
  return [
    {
      filePath,
      startLine: lineValue(value.startLine),
      endLine: lineValue(value.endLine),
      rangeLabel: nullableString(value.rangeLabel),
      note: nullableString(value.note),
    },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayValue(value: unknown): ReadonlyArray<unknown> {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
  const text = stringValue(value).trim();
  return text || null;
}

function lineValue(value: unknown): number | null {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numberValue)) return null;
  return Math.max(1, Math.trunc(numberValue));
}

function uniqueStrings(values: ReadonlyArray<unknown>): string[] {
  return Array.from(new Set(values.map((value) => stringValue(value).trim()).filter(Boolean)));
}

function slugForStep(title: string, index: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slug || `step-${index + 1}`;
}
