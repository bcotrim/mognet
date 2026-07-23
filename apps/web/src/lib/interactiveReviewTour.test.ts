import { describe, expect, it } from "vite-plus/test";

import {
  buildInteractiveReviewTourPrompt,
  extractInteractiveReviewTourFromText,
  filterInteractiveReviewFiles,
  isInteractiveReviewRequest,
  stripInteractiveReviewTourArtifact,
  stripInteractiveReviewTourPrompt,
} from "./interactiveReviewTour";

describe("interactiveReviewTour", () => {
  it("detects narrow interactive review requests", () => {
    expect(isInteractiveReviewRequest("interactive review")).toBe(true);
    expect(isInteractiveReviewRequest("/interactive-review of this codebase")).toBe(true);
    expect(isInteractiveReviewRequest("/tour of this diff")).toBe(true);
    expect(isInteractiveReviewRequest("Can you do an interactive review of this diff?")).toBe(true);
    expect(isInteractiveReviewRequest("please review this")).toBe(false);
  });

  it("builds an agent prompt with the structured artifact contract", () => {
    const prompt = buildInteractiveReviewTourPrompt({
      userRequest: "interactive review",
      projectTitle: "Mognet",
      workspaceRoot: "/repo",
      worktreePath: "/repo-worktree",
      branch: "feature/tour",
      diffScopeLabel: "Branch changes",
    });

    expect(prompt).toContain("Run an interactive review of the current diff");
    expect(prompt).toContain("interactive-review-tour-json");
    expect(prompt).toContain('"steps"');
    expect(prompt).toContain("Project: Mognet");
  });

  it("strips the generated tour prompt back to the visible user request", () => {
    const prompt = buildInteractiveReviewTourPrompt({
      userRequest: "/interactive-review of this codebase",
      projectTitle: "Mognet",
      workspaceRoot: "/repo",
      worktreePath: "/repo-worktree",
      branch: "feature/tour",
      diffScopeLabel: "Branch changes",
    });

    expect(stripInteractiveReviewTourPrompt(prompt)).toBe("/interactive-review of this codebase");
    expect(stripInteractiveReviewTourPrompt("normal message")).toBe("normal message");
  });

  it("uses the slash command label when stripping a generated tour prompt without a request", () => {
    const prompt = buildInteractiveReviewTourPrompt({
      userRequest: "",
      projectTitle: "Mognet",
      workspaceRoot: "/repo",
      worktreePath: "/repo-worktree",
      branch: "feature/tour",
      diffScopeLabel: "Branch changes",
    });

    expect(stripInteractiveReviewTourPrompt(prompt)).toBe("/interactive-review");
  });

  it("extracts a sanitized tour from the assistant artifact block", () => {
    const text = [
      "Here is the tour.",
      "",
      "```interactive-review-tour-json",
      JSON.stringify({
        version: 1,
        title: "Review the flow",
        summary: "A short summary.",
        steps: [
          {
            id: "flow",
            kind: "data-flow",
            title: "Follow the request",
            body: "The request now moves through the new parser.",
            whyThisMatters: "This is the main behavior.",
            files: ["src/parser.ts"],
            anchors: [
              {
                filePath: "src/parser.ts",
                startLine: 10.8,
                endLine: 22,
                rangeLabel: "10-22",
                note: "The parse point.",
              },
            ],
            questions: ["Should this be validated server-side?"],
            alternatives: ["Persist the artifact on the server."],
          },
        ],
      }),
      "```",
    ].join("\n");

    const tour = extractInteractiveReviewTourFromText(text);

    expect(tour?.title).toBe("Review the flow");
    expect(tour?.steps[0]?.kind).toBe("data-flow");
    expect(tour?.steps[0]?.files).toEqual(["src/parser.ts"]);
    expect(tour?.steps[0]?.anchors[0]?.startLine).toBe(10);
  });

  it("scopes diff files to the active review step", () => {
    const files = [
      { filePath: "src/entry.ts" },
      { filePath: "src/parser.ts" },
      { filePath: "src/view.tsx" },
    ];

    expect(
      filterInteractiveReviewFiles(files, {
        files: ["src/parser.ts", "src/missing.ts"],
      }),
    ).toEqual([{ filePath: "src/parser.ts" }]);
    expect(filterInteractiveReviewFiles(files, null)).toBe(files);
  });

  it("strips only the machine-readable artifact block", () => {
    const text = [
      "Readable summary.",
      "",
      "```interactive-review-tour-json",
      '{"version":1,"steps":[]}',
      "```",
    ].join("\n");

    expect(stripInteractiveReviewTourArtifact(text)).toBe("Readable summary.");
  });
});
