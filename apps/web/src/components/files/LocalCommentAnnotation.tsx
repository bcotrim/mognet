import { MessageCircle, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";

interface LocalCommentAnnotationProps {
  kind: "draft" | "comment";
  rangeLabel: string;
  text: string;
  onCancel: () => void;
  onComment: (text: string) => void;
  onDelete: () => void;
}

export function LocalCommentAnnotation({
  kind,
  rangeLabel,
  text: savedText,
  onCancel,
  onComment,
  onDelete,
}: LocalCommentAnnotationProps) {
  const [text, setText] = useState("");

  if (kind === "comment") {
    return (
      <div
        data-file-comment-annotation
        className="mx-3 my-2 rounded-lg border border-border bg-popover p-2.5 font-sans text-popover-foreground shadow-xl"
        contentEditable={false}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Inline comment</span>
          <span className="ml-auto text-[11px] text-muted-foreground">{rangeLabel}</span>
          <Button variant="ghost" size="icon-xs" aria-label="Delete comment" onClick={onDelete}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-popover-foreground">
          {savedText}
        </p>
      </div>
    );
  }

  return (
    <div
      data-file-comment-annotation
      className="mx-3 my-2 rounded-lg border border-border bg-popover p-2.5 font-sans text-popover-foreground shadow-xl"
      contentEditable={false}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-center gap-2">
        <MessageCircle className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Ask about selection</span>
        <span className="ml-auto text-[11px] text-muted-foreground">Lines {rangeLabel}</span>
      </div>
      <Textarea
        autoFocus
        size="sm"
        value={text}
        placeholder="Ask a question or request a change"
        aria-label={`Ask about lines ${rangeLabel}`}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && text.trim()) {
            event.preventDefault();
            onComment(text.trim());
          }
        }}
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={!text.trim()} onClick={() => onComment(text.trim())}>
          Add to chat
        </Button>
      </div>
    </div>
  );
}
