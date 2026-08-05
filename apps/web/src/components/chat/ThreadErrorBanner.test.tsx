import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ThreadErrorBanner } from "./ThreadErrorBanner";

describe("ThreadErrorBanner", () => {
  it("renders the full error inline instead of clamping it behind a tooltip", () => {
    const error =
      "Standalone chat bootstrap must target the reserved chat project.\nThe current payload targeted project-workspace-123.";
    const markup = renderToStaticMarkup(<ThreadErrorBanner error={error} />);

    expect(markup).toContain("Message failed");
    expect(markup).toContain("Standalone chat bootstrap must target the reserved chat project.");
    expect(markup).toContain("The current payload targeted project-workspace-123.");
    expect(markup).toContain("whitespace-pre-wrap");
    expect(markup).not.toContain("line-clamp");
  });

  it("aligns the warning and dismiss icons with the first line of a multi-line error", () => {
    const markup = renderToStaticMarkup(
      <ThreadErrorBanner
        error={"The first error line\ncontinues on a second line"}
        onDismiss={() => {}}
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-label="Dismiss error"');
    expect(markup).not.toContain("controlAlignment");
    expect(markup).toContain("flex gap-2 items-start");
    expect(markup).toContain("min-h-7 pt-1 sm:min-h-6 sm:pt-0.5");
    expect(markup).toContain("h-lh w-4");
    expect(markup).toContain("h-lh self-start");
  });
});
