/**
 * Shared prompt builders for text generation providers.
 *
 * Extracts the prompt construction logic that is identical across
 * Codex, Claude, and any future CLI-based text generation backends.
 *
 * @module textGenerationPrompts
 */
import * as Schema from "effect/Schema";
import type { ChatAttachment } from "@t3tools/contracts";

import { limitSection } from "./TextGenerationUtils.ts";
import type { TextGenerationPolicy } from "./TextGenerationPolicy.ts";

function policyInstruction(instruction: string | undefined): ReadonlyArray<string> {
  const trimmed = instruction?.trim();
  return trimmed ? ["", "Additional instructions:", limitSection(trimmed, 4_000)] : [];
}

// ---------------------------------------------------------------------------
// Commit message
// ---------------------------------------------------------------------------

export interface CommitMessagePromptInput {
  branch: string | null;
  stagedSummary: string;
  stagedPatch: string;
  includeBranch: boolean;
  policy?: TextGenerationPolicy | undefined;
}

export function buildCommitMessagePrompt(input: CommitMessagePromptInput) {
  const wantsBranch = input.includeBranch;

  const prompt = [
    "You write concise git commit messages.",
    wantsBranch
      ? "Return a JSON object with keys: subject, body, branch."
      : "Return a JSON object with keys: subject, body.",
    "Rules:",
    "- subject must be imperative, <= 72 chars, and no trailing period",
    "- body can be empty string or short bullet points",
    ...(wantsBranch
      ? ["- branch must be a short semantic git branch fragment for this change"]
      : []),
    "- capture the primary user-visible or developer-visible change",
    ...policyInstruction(input.policy?.commitInstructions),
    "",
    `Branch: ${input.branch ?? "(detached)"}`,
    "",
    "Staged files:",
    limitSection(input.stagedSummary, 6_000),
    "",
    "Staged patch:",
    limitSection(input.stagedPatch, 40_000),
  ].join("\n");

  if (wantsBranch) {
    return {
      prompt,
      outputSchema: Schema.Struct({
        subject: Schema.String,
        body: Schema.String,
        branch: Schema.String,
      }),
    };
  }

  return {
    prompt,
    outputSchema: Schema.Struct({
      subject: Schema.String,
      body: Schema.String,
    }),
  };
}

// ---------------------------------------------------------------------------
// PR content
// ---------------------------------------------------------------------------

export interface PrContentPromptInput {
  baseBranch: string;
  headBranch: string;
  commitSummary: string;
  diffSummary: string;
  diffPatch: string;
  policy?: TextGenerationPolicy | undefined;
}

export function buildPrContentPrompt(input: PrContentPromptInput) {
  const prompt = [
    "You write GitHub pull request content.",
    "Return a JSON object with keys: title, body.",
    "Rules:",
    "- title should be concise and specific",
    "- body must be markdown and include headings '## Summary' and '## Testing'",
    "- under Summary, provide short bullet points",
    "- under Testing, include bullet points with concrete checks or 'Not run' where appropriate",
    ...policyInstruction(input.policy?.changeRequestInstructions),
    "",
    `Base branch: ${input.baseBranch}`,
    `Head branch: ${input.headBranch}`,
    "",
    "Commits:",
    limitSection(input.commitSummary, 12_000),
    "",
    "Diff stat:",
    limitSection(input.diffSummary, 12_000),
    "",
    "Diff patch:",
    limitSection(input.diffPatch, 40_000),
  ].join("\n");

  const outputSchema = Schema.Struct({
    title: Schema.String,
    body: Schema.String,
  });

  return { prompt, outputSchema };
}

// ---------------------------------------------------------------------------
// Branch name
// ---------------------------------------------------------------------------

export interface BranchNamePromptInput {
  message: string;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
  policy?: TextGenerationPolicy | undefined;
}

interface PromptFromMessageInput {
  instruction: string;
  responseShape: string;
  rules: ReadonlyArray<string>;
  message: string;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
  additionalInstructions?: string | undefined;
}

function buildPromptFromMessage(input: PromptFromMessageInput): string {
  const attachmentLines = (input.attachments ?? []).map(
    (attachment) => `- ${attachment.name} (${attachment.mimeType}, ${attachment.sizeBytes} bytes)`,
  );

  const promptSections = [
    input.instruction,
    input.responseShape,
    "Rules:",
    ...input.rules.map((rule) => `- ${rule}`),
    "",
    "User message:",
    limitSection(input.message, 8_000),
    ...policyInstruction(input.additionalInstructions),
  ];
  if (attachmentLines.length > 0) {
    promptSections.push(
      "",
      "Attachment metadata:",
      limitSection(attachmentLines.join("\n"), 4_000),
    );
  }

  return promptSections.join("\n");
}

export function buildBranchNamePrompt(input: BranchNamePromptInput) {
  const prompt = buildPromptFromMessage({
    instruction: "You generate concise git branch names.",
    responseShape: "Return a JSON object with key: branch.",
    rules: [
      "Branch should describe the requested work from the user message.",
      "Keep it short and specific (2-6 words).",
      "Use plain words only, no issue prefixes and no punctuation-heavy text.",
      "If images are attached, use them as primary context for visual/UI issues.",
    ],
    message: input.message,
    attachments: input.attachments,
    additionalInstructions: input.policy?.branchInstructions,
  });
  const outputSchema = Schema.Struct({
    branch: Schema.String,
  });

  return { prompt, outputSchema };
}

// ---------------------------------------------------------------------------
// Thread title
// ---------------------------------------------------------------------------

export interface ThreadTitlePromptInput {
  message: string;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
  policy?: TextGenerationPolicy | undefined;
}

export function buildThreadTitlePrompt(input: ThreadTitlePromptInput) {
  const prompt = buildPromptFromMessage({
    instruction: "You write concise thread titles for coding conversations.",
    responseShape: "Return a JSON object with key: title.",
    rules: [
      "Title should summarize the user's request, not restate it verbatim.",
      "Keep it short and specific (3-8 words).",
      "Avoid quotes, filler, prefixes, and trailing punctuation.",
      "If images are attached, use them as primary context for visual/UI issues.",
    ],
    message: input.message,
    attachments: input.attachments,
    additionalInstructions: input.policy?.threadTitleInstructions,
  });
  const outputSchema = Schema.Struct({
    title: Schema.String,
  });

  return { prompt, outputSchema };
}

// ---------------------------------------------------------------------------
// Review snapshot
// ---------------------------------------------------------------------------

export interface ReviewSnapshotPromptInput {
  sourceTitle: string;
  diff: string;
  fileContexts: ReadonlyArray<{
    filePath: string;
    changeKind: string;
    additions: number;
    deletions: number;
    hunkCount: number;
    truncated: boolean;
    anchors: ReadonlyArray<{
      id: string;
      rangeLabel: string;
      diff: string;
    }>;
  }>;
  originThreadId?: string | undefined;
  originTurnId?: string | undefined;
}

function formatReviewFileContext(file: ReviewSnapshotPromptInput["fileContexts"][number]): string {
  const anchors = file.anchors
    .slice(0, 24)
    .map((anchor) =>
      [
        `Anchor: ${anchor.id}`,
        `Range: ${anchor.rangeLabel}`,
        limitSection(anchor.diff, 1_200),
      ].join("\n"),
    )
    .join("\n\n");

  return [
    `File: ${file.filePath}`,
    `Change: ${file.changeKind}, +${file.additions}/-${file.deletions}, hunks: ${file.hunkCount}`,
    `Truncated: ${file.truncated ? "yes" : "no"}`,
    anchors.length > 0 ? anchors : "Anchors: none",
  ].join("\n");
}

export function buildReviewSnapshotPrompt(input: ReviewSnapshotPromptInput) {
  const fileContext = input.fileContexts.map(formatReviewFileContext).join("\n\n---\n\n");
  const prompt = [
    "You are reviewing a code diff.",
    "Return a JSON object with keys: summary, files.",
    "Rules:",
    "- follow all existing repository, provider, and user review instructions available to you",
    "- focus findings on correctness, regressions, reliability, security, and missing tests",
    "- avoid style-only comments unless they affect maintainability or behavior",
    "- every finding must reference an existing filePath from the input",
    "- use anchorId only when the finding applies to one of the listed anchors",
    "- if there are no meaningful issues for a file, return an empty findings array for that file",
    "- explanations should describe what changed and why the file matters in this diff",
    "- keep the summary concise",
    "",
    `Source: ${input.sourceTitle}`,
    ...(input.originThreadId ? [`Thread: ${input.originThreadId}`] : []),
    ...(input.originTurnId ? [`Turn: ${input.originTurnId}`] : []),
    "",
    "Files and anchors:",
    limitSection(fileContext, 28_000),
    "",
    "Diff:",
    limitSection(input.diff, 40_000),
  ].join("\n");

  const outputSchema = Schema.Struct({
    summary: Schema.String,
    files: Schema.Array(
      Schema.Struct({
        filePath: Schema.String,
        explanation: Schema.String,
        findings: Schema.Array(
          Schema.Struct({
            id: Schema.String,
            filePath: Schema.String,
            severity: Schema.Literals(["critical", "major", "minor", "info"]),
            title: Schema.String,
            body: Schema.String,
            anchorId: Schema.optional(Schema.String),
            suggestedFix: Schema.optional(Schema.String),
            confidence: Schema.optional(
              Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
            ),
          }),
        ),
      }),
    ),
  });

  return { prompt, outputSchema };
}
