import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { PanelLayoutControls } from "./PanelLayoutControls";

const noop = vi.fn();

describe("PanelLayoutControls", () => {
  it("renders the right panel toggle without a terminal drawer toggle", () => {
    const markup = renderToStaticMarkup(
      <PanelLayoutControls
        rightPanelAvailable
        rightPanelOpen={false}
        rightPanelShortcutLabel="Mod+Shift+J"
        onToggleRightPanel={noop}
      />,
    );

    expect(markup).not.toContain("Toggle terminal drawer");
    expect(markup).toContain("Toggle right panel");
  });

  it("hides all panel toggles when no panel surfaces are available", () => {
    const markup = renderToStaticMarkup(
      <PanelLayoutControls
        rightPanelAvailable={false}
        rightPanelOpen={false}
        rightPanelShortcutLabel="Mod+Shift+J"
        onToggleRightPanel={noop}
      />,
    );

    expect(markup).not.toContain("Toggle terminal drawer");
    expect(markup).not.toContain("Toggle right panel");
    expect(markup).not.toContain("Right panel is unavailable");
  });
});
