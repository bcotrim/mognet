import type { ScopedThreadRef } from "@t3tools/contracts";
import { MessageCircle, XIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { cn, randomUUID } from "~/lib/utils";
import { buildQuotedReviewComment } from "~/reviewCommentContext";

import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { MessageCopyButton } from "./MessageCopyButton";

interface QuoteReplySelectorProps {
  children: ReactNode;
  composerDraftTarget: ScopedThreadRef | DraftId;
  sourceId: string;
  sourceTitle: string;
  sourceLabel: string;
  rangeLabel?: string;
  disabled?: boolean;
  className?: string;
}

interface CapturedQuoteSelection {
  quote: string;
  x: number;
  y: number;
  placement: "above" | "below";
  rects: ReadonlyArray<CapturedQuoteSelectionRect>;
}

interface CapturedQuoteSelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const MAX_QUOTE_LENGTH = 12_000;

function normalizeQuoteText(value: string): string {
  return value
    .replaceAll("\u00a0", " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_QUOTE_LENGTH);
}

function selectionEndpointElement(node: Node | null): Element | null {
  if (node instanceof Element) return node;
  return node?.parentElement ?? null;
}

function selectionIsInsideRoot(selection: Selection, root: HTMLElement): boolean {
  const anchor = selectionEndpointElement(selection.anchorNode);
  const focus = selectionEndpointElement(selection.focusNode);
  return Boolean(anchor && focus && root.contains(anchor) && root.contains(focus));
}

function rangeRect(range: Range): DOMRect | null {
  const rect = range.getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) return rect;
  return range.getClientRects()[0] ?? null;
}

function rangeHighlightRects(range: Range): ReadonlyArray<CapturedQuoteSelectionRect> {
  const rects = Array.from(range.getClientRects())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => ({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }));
  if (rects.length > 0) return rects;

  const rect = rangeRect(range);
  return rect
    ? [
        {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
      ]
    : [];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function QuoteReplySelector({
  children,
  composerDraftTarget,
  sourceId,
  sourceTitle,
  sourceLabel,
  rangeLabel,
  disabled = false,
  className,
}: QuoteReplySelectorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedRangeRef = useRef<Range | null>(null);
  const addReviewComment = useComposerDraftStore((store) => store.addReviewComment);
  const [selection, setSelection] = useState<CapturedQuoteSelection | null>(null);
  const [message, setMessage] = useState("");

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    selectedRangeRef.current = null;
    setSelection(null);
    setMessage("");
  }, []);

  const updateSelectionPosition = useCallback(() => {
    const range = selectedRangeRef.current;
    if (!range) return;

    const rect = rangeRect(range);
    if (!rect) return;

    const maxX = Math.max(16, window.innerWidth - 16);
    const placement = rect.top > 220 ? "above" : "below";
    setSelection((current) =>
      current
        ? {
            ...current,
            x: clamp(rect.left + rect.width / 2, 16, maxX),
            y: placement === "above" ? Math.max(8, rect.top - 8) : rect.bottom + 8,
            placement,
            rects: rangeHighlightRects(range),
          }
        : current,
    );
  }, []);

  const captureSelection = useCallback(
    (event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-quote-reply-popover='true']") !== null
      ) {
        return;
      }

      const root = rootRef.current;
      const activeSelection = window.getSelection();
      if (!root || !activeSelection || activeSelection.rangeCount === 0) {
        clearSelection();
        return;
      }
      if (activeSelection.isCollapsed || !selectionIsInsideRoot(activeSelection, root)) {
        clearSelection();
        return;
      }

      const quote = normalizeQuoteText(activeSelection.toString());
      if (quote.length === 0) {
        clearSelection();
        return;
      }

      const range = activeSelection.getRangeAt(0).cloneRange();
      const rect = rangeRect(range);
      if (!rect) {
        clearSelection();
        return;
      }

      const maxX = Math.max(16, window.innerWidth - 16);
      const placement = rect.top > 220 ? "above" : "below";
      selectedRangeRef.current = range;
      setSelection({
        quote,
        x: clamp(rect.left + rect.width / 2, 16, maxX),
        y: placement === "above" ? Math.max(8, rect.top - 8) : rect.bottom + 8,
        placement,
        rects: rangeHighlightRects(range),
      });
    },
    [clearSelection, disabled],
  );

  useEffect(() => {
    if (!selection) return;
    const frame = window.requestAnimationFrame(() => textareaRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [selection]);

  useEffect(() => {
    if (!selection) return;
    let frame: number | null = null;
    const queueUpdate = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        updateSelectionPosition();
      });
    };

    const handlePointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      const popover = popoverRef.current;
      const target = event.target;
      if (root && target instanceof Node && root.contains(target)) {
        return;
      }
      if (popover && target instanceof Node && popover.contains(target)) {
        return;
      }
      clearSelection();
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        clearSelection();
      }
    };
    const handleScroll = (event: Event) => {
      const popover = popoverRef.current;
      if (popover && event.target instanceof Node && popover.contains(event.target)) {
        return;
      }
      clearSelection();
    };

    document.addEventListener("scroll", handleScroll, true);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", queueUpdate);
    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", queueUpdate);
    };
  }, [clearSelection, selection, updateSelectionPosition]);

  const submitQuote = useCallback(() => {
    const text = message.trim();
    if (!selection || text.length === 0) return;
    addReviewComment(
      composerDraftTarget,
      buildQuotedReviewComment({
        id: `quote:${randomUUID()}`,
        sourceId,
        sourceTitle,
        sourceLabel,
        quote: selection.quote,
        text,
        ...(rangeLabel ? { rangeLabel } : {}),
      }),
    );
    clearSelection();
  }, [
    addReviewComment,
    clearSelection,
    composerDraftTarget,
    message,
    rangeLabel,
    selection,
    sourceId,
    sourceLabel,
    sourceTitle,
  ]);

  return (
    <div
      ref={rootRef}
      className={cn("relative", className)}
      onMouseUpCapture={captureSelection}
      onKeyUpCapture={captureSelection}
    >
      {children}
      {selection && typeof document !== "undefined"
        ? createPortal(
            <>
              {selection.rects.map((rect) => (
                <div
                  key={`${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}`}
                  aria-hidden
                  className="pointer-events-none fixed z-40 rounded-[3px] bg-primary/25 ring-1 ring-primary/20"
                  style={{
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height,
                  }}
                />
              ))}
              <div
                ref={popoverRef}
                data-quote-reply-popover="true"
                className="fixed z-50 w-80 max-w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-2.5 text-popover-foreground shadow-xl"
                style={{
                  left: selection.x,
                  top: selection.y,
                  transform:
                    selection.placement === "above"
                      ? "translate(-50%, -100%)"
                      : "translate(-50%, 0)",
                }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="mb-2 flex items-center gap-2">
                  <MessageCircle className="size-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">Quote reply</span>
                  <MessageCopyButton
                    text={selection.quote}
                    size="icon-xs"
                    variant="ghost"
                    ariaLabel="Copy selected text"
                    tooltip="Copy selected text"
                    target="selected text"
                    className="ml-auto"
                  />
                  <Button
                    type="button"
                    aria-label="Cancel quote reply"
                    size="icon-xs"
                    variant="ghost"
                    onClick={clearSelection}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                </div>
                <Textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      clearSelection();
                      return;
                    }
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      submitQuote();
                    }
                  }}
                  placeholder="Message for this quote"
                  aria-label="Message for quoted reply"
                  size="sm"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={clearSelection}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" disabled={!message.trim()} onClick={submitQuote}>
                    Add quote
                  </Button>
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
