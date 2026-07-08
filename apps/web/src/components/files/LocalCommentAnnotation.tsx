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
        className="mx-3 my-2 rounded-xl border border-border/70 bg-background p-3 shadow-sm"
        contentEditable={false}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="size-4 text-muted-foreground" />
          <span className="text-xs font-medium">Inline comment</span>
          <span className="ml-auto text-[11px] text-muted-foreground">{rangeLabel}</span>
          <Button variant="ghost" size="icon-xs" aria-label="Delete comment" onClick={onDelete}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {savedText}
        </p>
      </div>
    );
  }

  return (
    <div
      data-file-comment-annotation
      className="mx-3 my-2 rounded-xl border border-border/70 bg-background p-3 shadow-lg"
      contentEditable={false}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <MessageCircle className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Ask about selection</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">Lines {rangeLabel}</div>
      <Textarea
        autoFocus
        className="mt-3"
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
