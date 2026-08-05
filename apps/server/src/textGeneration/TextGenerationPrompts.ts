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

const EARLIER_CONTENT_TRUNCATION_MARKER = "[Earlier content truncated]\n\n";

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
  includeBranch?: boolean;
  policy?: TextGenerationPolicy | undefined;
}

export function buildCommitMessagePrompt(input: CommitMessagePromptInput) {
  const wantsBranch = input.includeBranch === true;

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
// Change request content
// ---------------------------------------------------------------------------

export interface PrContentPromptInput {
  baseBranch: string;
  headBranch: string;
  commitSummary: string;
  diffSummary: string;
  diffPatch: string;
  changeRequestTemplate?: string | undefined;
  policy?: TextGenerationPolicy | undefined;
}

export function buildPrContentPrompt(input: PrContentPromptInput) {
  const changeRequestTemplate = input.changeRequestTemplate?.trim();
  const bodyRules = changeRequestTemplate
    ? [
        "- body must be markdown and follow the repository change request template structure",
        "- fill in the template sections appropriately for this change",
        "- drop HTML comments from the template in the generated body",
        "- keep the template's markdown structure",
      ]
    : [
        "- body must be markdown and include headings '## Summary' and '## Testing'",
        "- under Summary, provide short bullet points",
        "- under Testing, include bullet points with concrete checks or 'Not run' where appropriate",
      ];
  const prompt = [
    "You write source control change request content.",
    "Return a JSON object with keys: title, body.",
    "Rules:",
    "- title should be concise and specific",
    ...bodyRules,
    ...policyInstruction(input.policy?.changeRequestInstructions),
    ...(changeRequestTemplate
      ? ["", "Repository change request template:", limitSection(changeRequestTemplate, 8_000)]
      : []),
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
  guidance?: ReadonlyArray<string> | undefined;
  rulesLabel?: string | undefined;
  rules: ReadonlyArray<string>;
  message: string;
  messageLabel?: string | undefined;
  preserveMessageEnd?: boolean | undefined;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
  additionalInstructions?: string | undefined;
}

function preserveMessageEnd(message: string): string {
  const alreadyTruncated = message.startsWith(EARLIER_CONTENT_TRUNCATION_MARKER);
  const contents = alreadyTruncated
    ? message.slice(EARLIER_CONTENT_TRUNCATION_MARKER.length)
    : message;
  if (!alreadyTruncated && contents.length <= 8_000) {
    return contents;
  }
  return `${EARLIER_CONTENT_TRUNCATION_MARKER}${contents.slice(-8_000)}`;
}

function buildPromptFromMessage(input: PromptFromMessageInput): string {
  const attachmentLines = (input.attachments ?? []).map(
    (attachment) => `- ${attachment.name} (${attachment.mimeType}, ${attachment.sizeBytes} bytes)`,
  );

  const promptSections = [
    input.instruction,
    input.responseShape,
    ...(input.guidance ?? []),
    input.rulesLabel ?? "Rules:",
    ...input.rules.map((rule) => `- ${rule}`),
    "",
    `${input.messageLabel ?? "User message"}:`,
    input.preserveMessageEnd
      ? preserveMessageEnd(input.message)
      : limitSection(input.message, 8_000),
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
  previousTitle?: string | undefined;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
  policy?: TextGenerationPolicy | undefined;
}

export function buildThreadTitlePrompt(input: ThreadTitlePromptInput) {
  const isRegeneration = input.previousTitle !== undefined;
  const prompt = buildPromptFromMessage({
    instruction: isRegeneration
      ? [
          "Generate a new title that will help the user recognize this Mognet thread weeks later.",
          `The previous title was ${JSON.stringify(input.previousTitle)}.`,
        ].join("\n")
      : "Generate a title that will help the user recognize this Mognet thread weeks later.",
    responseShape: "Return JSON with exactly one key: title.",
    guidance: [
      "",
      "Before answering, silently reduce the request to:",
      "- Subject: What system, feature, or problem is this really about?",
      "- Outcome: What does the user ultimately want to understand or change?",
      "- Incidental instructions: What only describes how the agent should do the work?",
      "",
      "Title the subject and outcome. Discard incidental instructions.",
      "",
    ],
    rulesLabel: "Editorial rules:",
    rules: [
      "3-8 words, fewer than 40 characters.",
      "Use a compact noun phrase or clear action phrase.",
      "Capture the umbrella goal when the request lists several symptoms or steps.",
      "Name the product change, not the mock, plan, report, branch, or PR used to produce it.",
      "Models, subagents, tools, output formats, and monitoring instructions do not belong in the title unless they are themselves the topic.",
      'For reviews, name what is being reviewed and the relevant concern. Avoid generic titles such as "Review PR 123" when linked or attached context reveals the subject.',
      "For research, name the question domain rather than the requested research process.",
      "Do not claim the work is complete.",
      "Do not copy and truncate the user's message.",
      "Avoid project names already visible in the UI, quotes, labels, filler, and trailing punctuation.",
      "Use attached images as primary context for UI issues.",
      "When a URL or attachment is the only source of the subject, use available tools to inspect it. If it cannot be resolved, remain accurate rather than guessing.",
      ...(isRegeneration
        ? [
            "Capture the current durable subject and outcome across the whole thread, not merely its initial request or latest step.",
            "Return a different title from the previous title.",
          ]
        : []),
    ],
    message: input.message,
    ...(isRegeneration
      ? {
          messageLabel: "Thread contents",
          preserveMessageEnd: true,
        }
      : {}),
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
