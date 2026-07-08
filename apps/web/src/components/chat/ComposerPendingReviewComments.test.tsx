import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import type { ReviewCommentContext } from "~/reviewCommentContext";

import { ComposerPendingReviewComments } from "./ComposerPendingReviewComments";

function quotedComment(input: Partial<ReviewCommentContext> = {}): ReviewCommentContext {
  return {
    id: "quote-1",
    sectionId: "assistant:message-1",
    sectionTitle: "AI reply",
    filePath: "AI reply",
    startIndex: 0,
    endIndex: 0,
    rangeLabel: "Quote",
    text: "Nice catch",
    diff: "npm run lint passes. npm run build gets past the app type errors now.",
    fenceLanguage: "md",
    ...input,
  };
}

describe("ComposerPendingReviewComments", () => {
  it("labels quote chips with the selected text excerpt", () => {
    const markup = renderToStaticMarkup(
      <ComposerPendingReviewComments
        comments={[
          quotedComment(),
          quotedComment({
            id: "quote-2",
            diff: "the hook no longer stores IntersectionObserver in React state",
          }),
        ]}
        onRemove={vi.fn()}
      />,
    );

    expect(markup).toContain("AI reply: npm run lint passes.");
    expect(markup).toContain("AI reply: the hook no longer stores IntersectionObserver");
    expect(markup).not.toContain("AI reply Quote");
  });

  it("labels review-step chips with the step context excerpt", () => {
    const markup = renderToStaticMarkup(
      <ComposerPendingReviewComments
        comments={[
          quotedComment({
            id: "review-step-1",
            sectionId: "review-step:step-a",
            sectionTitle: "Review step",
            filePath: "Three layers",
            diff: "Step: Three layers\n\nThe diff has a clear dependency order.",
          }),
        ]}
        onRemove={vi.fn()}
      />,
    );

    expect(markup).toContain("Review step: Step: Three layers");
    expect(markup).not.toContain("Three layers Quote");
  });
});
