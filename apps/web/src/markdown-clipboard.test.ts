import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { serializeRenderedMarkdownFragment } from "./markdown-clipboard";

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

class FakeText {
  readonly nodeType = TEXT_NODE;
  readonly childNodes: ReadonlyArray<never> = [];
  previousSibling: FakeElement | FakeText | null = null;
  nextSibling: FakeElement | FakeText | null = null;

  constructor(readonly textContent: string) {}
}

class FakeElement {
  readonly nodeType = ELEMENT_NODE;
  readonly childNodes: Array<FakeElement | FakeText> = [];
  previousSibling: FakeElement | FakeText | null = null;
  nextSibling: FakeElement | FakeText | null = null;
  readonly classList = {
    contains: (name: string) => this.classNames.includes(name),
  };

  constructor(
    readonly tagName: string,
    private readonly classNames: ReadonlyArray<string> = [],
    private readonly attributes: Readonly<Record<string, string>> = {},
  ) {}

  get localName(): string {
    return this.tagName.toLowerCase();
  }

  get textContent(): string {
    return this.childNodes.map((child) => child.textContent).join("");
  }

  append(...children: Array<FakeElement | FakeText>): this {
    this.childNodes.push(...children);
    this.childNodes.forEach((child, index) => {
      child.previousSibling = this.childNodes[index - 1] ?? null;
      child.nextSibling = this.childNodes[index + 1] ?? null;
    });
    return this;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  hasAttribute(name: string): boolean {
    return Object.hasOwn(this.attributes, name);
  }

  closest(): FakeElement | null {
    return null;
  }

  querySelector(): FakeElement | null {
    return null;
  }

  querySelectorAll(): ReadonlyArray<FakeElement> {
    return [];
  }
}

function asNode(element: FakeElement): Node {
  return element as unknown as Node;
}

function shikiCodeLine(text: string): FakeElement {
  const token = new FakeElement("SPAN").append(new FakeText(text));
  return new FakeElement("SPAN", ["line"]).append(token);
}

describe("serializeRenderedMarkdownFragment", () => {
  beforeEach(() => {
    vi.stubGlobal("Node", { TEXT_NODE, ELEMENT_NODE });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("wraps inline code in backticks", () => {
    const paragraph = new FakeElement("P").append(
      new FakeText("run "),
      new FakeElement("CODE").append(new FakeText("git status")),
      new FakeText(" first"),
    );
    const container = new FakeElement("DIV").append(paragraph);

    expect(serializeRenderedMarkdownFragment(asNode(container))).toBe("run `git status` first");
  });

  it("keeps a highlighted block code selection plain when its pre wrapper is outside the range", () => {
    const code = new FakeElement("CODE").append(
      shikiCodeLine("git show-ref --verify refs/remotes/origin/opt/deploy/dev"),
    );
    const container = new FakeElement("DIV").append(code);

    expect(serializeRenderedMarkdownFragment(asNode(container))).toBe(
      "git show-ref --verify refs/remotes/origin/opt/deploy/dev",
    );
  });

  it("keeps a multi-line code selection plain instead of inline-wrapping it", () => {
    const code = new FakeElement("CODE").append(new FakeText("first line\nsecond line"));
    const container = new FakeElement("DIV").append(code);

    expect(serializeRenderedMarkdownFragment(asNode(container))).toBe("first line\nsecond line");
  });

  it("drops soft wraps but preserves semantic line breaks", () => {
    const container = new FakeElement("DIV").append(
      new FakeElement("P").append(
        new FakeText("A regular sentence\nwrapped in its Markdown source."),
      ),
      new FakeText("\n"),
      new FakeElement("P").append(
        new FakeText("An intentional break"),
        new FakeElement("BR"),
        new FakeText("\ncontinues here."),
      ),
      new FakeText("\n"),
      new FakeElement("PRE").append(new FakeText("first line\nsecond line\n")),
    );

    expect(serializeRenderedMarkdownFragment(asNode(container))).toBe(
      "A regular sentence wrapped in its Markdown source.\n\nAn intentional break\ncontinues here.\n\n```\nfirst line\nsecond line\n```",
    );
  });

  it("uses a rendered card's explicit Markdown copy representation", () => {
    const card = new FakeElement("DIV", [], {
      "data-markdown-copy": "Hello World (Document template)\n\n",
    }).append(
      new FakeElement("SPAN").append(new FakeText("Hello World")),
      new FakeElement("SPAN").append(new FakeText("Document template")),
      new FakeElement("BUTTON").append(new FakeText("Use template")),
    );
    const container = new FakeElement("DIV").append(card);

    expect(serializeRenderedMarkdownFragment(asNode(container))).toBe(
      "Hello World (Document template)",
    );
  });
});
