import { Check, Copy, MessageCircle, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  COMPOSER_INLINE_CHIP_CLASS_NAME,
  COMPOSER_INLINE_CHIP_DISMISS_BUTTON_CLASS_NAME,
  COMPOSER_INLINE_CHIP_ICON_CLASS_NAME,
  COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME,
} from "../composerInlineChip";
import { Button } from "../ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogPopup, DialogTitle } from "../ui/dialog";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { isQuotedReviewComment, type ReviewCommentContext } from "~/reviewCommentContext";
import { cn } from "~/lib/utils";

interface ComposerPendingReviewCommentsProps {
  comments: ReadonlyArray<ReviewCommentContext>;
  onRemove: (commentId: string) => void;
  className?: string;
}

const QUOTE_LABEL_MAX_LENGTH = 48;

function formatQuoteExcerpt(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= QUOTE_LABEL_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, QUOTE_LABEL_MAX_LENGTH - 1).trimEnd()}...`;
}

function formatCommentLabel(comment: ReviewCommentContext): string {
  if (isQuotedReviewComment(comment)) {
    const excerpt = formatQuoteExcerpt(comment.diff);
    return excerpt.length > 0 ? `${comment.sectionTitle}: ${excerpt}` : comment.sectionTitle;
  }
  return `${comment.filePath} ${comment.rangeLabel}`;
}

function formatCommentTooltip(comment: ReviewCommentContext): string {
  if (!isQuotedReviewComment(comment)) return comment.text;

  const quote = comment.diff.trim();
  if (quote.length === 0) return comment.text;
  return comment.text.trim().length > 0 ? `${comment.text.trim()}\n\n${quote}` : quote;
}

export function ComposerPendingReviewComments({
  comments,
  onRemove,
  className,
}: ComposerPendingReviewCommentsProps) {
  const [inspectedComment, setInspectedComment] = useState<ReviewCommentContext | null>(null);

  if (comments.length === 0) return null;

  return (
    <>
      <div className={cn("flex flex-wrap gap-1.5", className)}>
        {comments.map((comment) => {
          const label = formatCommentLabel(comment);
          const tooltip = formatCommentTooltip(comment);
          return (
            <Tooltip key={comment.id}>
              <TooltipTrigger
                render={
                  <span
                    role="button"
                    tabIndex={0}
                    className={cn(COMPOSER_INLINE_CHIP_CLASS_NAME, "pr-1")}
                    onClick={() => setInspectedComment(comment)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      setInspectedComment(comment);
                    }}
                  >
                    <MessageCircle
                      className={cn(COMPOSER_INLINE_CHIP_ICON_CLASS_NAME, "size-3.5")}
                    />
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
      <PendingReviewCommentDialog
        comment={inspectedComment}
        onOpenChange={(open) => {
          if (!open) setInspectedComment(null);
        }}
      />
    </>
  );
}

function PendingReviewCommentDialog({
  comment,
  onOpenChange,
}: {
  comment: ReviewCommentContext | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const context = comment?.diff.trim() ?? "";
  const note = comment?.text.trim() ?? "";
  const copyText = [note, context].filter(Boolean).join("\n\n");

  useEffect(() => {
    setCopied(false);
  }, [comment?.id]);

  const copyComment = useCallback(() => {
    if (!copyText || typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(copyText).then(() => setCopied(true));
  }, [copyText]);

  return (
    <Dialog open={comment !== null} onOpenChange={onOpenChange}>
      <DialogPopup className="h-[min(78vh,720px)] max-w-3xl overflow-hidden">
        <DialogHeader className="border-b border-border/70 bg-background px-4 py-3">
          <div className="flex min-w-0 items-center gap-3 pr-8">
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base leading-5">Inline comment</DialogTitle>
              <DialogDescription className="mt-1 truncate text-xs">
                {comment ? formatCommentLabel(comment) : ""}
              </DialogDescription>
            </div>
            <Button
              size="xs"
              variant="outline"
              disabled={!copyText}
              onClick={copyComment}
              className="shrink-0"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto bg-background p-4">
          {note ? (
            <div className="mb-4 rounded-md border border-border/70 bg-muted/20 p-3 text-sm whitespace-pre-wrap text-foreground">
              {note}
            </div>
          ) : null}
          {context ? (
            <pre className="overflow-visible rounded-md border border-border/70 bg-muted/20 p-3 font-mono text-[11px] leading-relaxed whitespace-pre text-foreground">
              {context}
            </pre>
          ) : (
            <div className="text-xs text-muted-foreground">No context attached.</div>
          )}
        </div>
      </DialogPopup>
    </Dialog>
  );
}
