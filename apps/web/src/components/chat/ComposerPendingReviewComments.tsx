import { MessageCircle, X } from "lucide-react";

import {
  COMPOSER_INLINE_CHIP_CLASS_NAME,
  COMPOSER_INLINE_CHIP_DISMISS_BUTTON_CLASS_NAME,
  COMPOSER_INLINE_CHIP_ICON_CLASS_NAME,
  COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME,
} from "../composerInlineChip";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { ReviewCommentContext } from "~/reviewCommentContext";
import { cn } from "~/lib/utils";

interface ComposerPendingReviewCommentsProps {
  comments: ReadonlyArray<ReviewCommentContext>;
  onRemove: (commentId: string) => void;
  className?: string;
}

const QUOTE_LABEL_MAX_LENGTH = 48;

function isQuotedReplyComment(comment: ReviewCommentContext): boolean {
  return comment.sectionId.startsWith("assistant:") || comment.sectionId.startsWith("plan:");
}

function formatQuoteExcerpt(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= QUOTE_LABEL_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, QUOTE_LABEL_MAX_LENGTH - 1).trimEnd()}...`;
}

function formatCommentLabel(comment: ReviewCommentContext): string {
  if (isQuotedReplyComment(comment)) {
    const excerpt = formatQuoteExcerpt(comment.diff);
    return excerpt.length > 0 ? `${comment.sectionTitle}: ${excerpt}` : comment.sectionTitle;
  }
  return `${comment.filePath} ${comment.rangeLabel}`;
}

function formatCommentTooltip(comment: ReviewCommentContext): string {
  if (!isQuotedReplyComment(comment)) return comment.text;

  const quote = comment.diff.trim();
  if (quote.length === 0) return comment.text;
  return comment.text.trim().length > 0 ? `${comment.text.trim()}\n\n${quote}` : quote;
}

export function ComposerPendingReviewComments({
  comments,
  onRemove,
  className,
}: ComposerPendingReviewCommentsProps) {
  if (comments.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {comments.map((comment) => {
        const label = formatCommentLabel(comment);
        const tooltip = formatCommentTooltip(comment);
        return (
          <Tooltip key={comment.id}>
            <TooltipTrigger
              render={
                <span className={cn(COMPOSER_INLINE_CHIP_CLASS_NAME, "pr-1")}>
                  <MessageCircle className={cn(COMPOSER_INLINE_CHIP_ICON_CLASS_NAME, "size-3.5")} />
                  <span className={COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME}>{label}</span>
                  <button
                    type="button"
                    aria-label={`Remove comment on ${label}`}
                    className={COMPOSER_INLINE_CHIP_DISMISS_BUTTON_CLASS_NAME}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onRemove(comment.id);
                    }}
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              }
            />
            <TooltipPopup side="top" className="max-w-96 whitespace-pre-wrap leading-tight">
              {tooltip}
            </TooltipPopup>
          </Tooltip>
        );
      })}
    </div>
  );
}
