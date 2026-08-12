import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { serializeRenderedMarkdownFragment } from "./markdown-clipboard";

function text(textContent: string): Node {
  return {
    nodeType: 3,
    childNodes: [],
    previousSibling: null,
    nextSibling: null,
    textContent,
  } as unknown as Node;
}

function element(tagName: string, ...childNodes: Node[]): Element {
  const node = {
    nodeType: 1,
    tagName,
    localName: tagName.toLowerCase(),
    childNodes,
    previousSibling: null,
    nextSibling: null,
    classList: { contains: () => false },
    hasAttribute: () => false,
    getAttribute: () => null,
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  } as unknown as Element;
  Object.defineProperty(node, "textContent", {
    get: () => childNodes.map((child) => child.textContent ?? "").join(""),
  });
  childNodes.forEach((child, index) => {
    Object.defineProperties(child, {
      previousSibling: { value: childNodes[index - 1] ?? null },
      nextSibling: { value: childNodes[index + 1] ?? null },
    });
  });
  return node;
}

describe("serializeRenderedMarkdownFragment", () => {
  beforeEach(() => vi.stubGlobal("Node", { ELEMENT_NODE: 1, TEXT_NODE: 3 }));
  afterEach(() => vi.unstubAllGlobals());

  it("drops soft wraps but preserves semantic line breaks", () => {
    const rendered = element(
      "DIV",
      element("P", text("A regular sentence\nwrapped in its Markdown source.")),
      text("\n"),
      element("P", text("An intentional break"), element("BR"), text("\ncontinues here.")),
      text("\n"),
      element("PRE", text("first line\nsecond line\n")),
    );

    expect(serializeRenderedMarkdownFragment(rendered)).toBe(
      "A regular sentence wrapped in its Markdown source.\n\nAn intentional break\ncontinues here.\n\n```\nfirst line\nsecond line\n```",
    );
  });
});
