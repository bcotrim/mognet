import {
  EXTERNAL_TERMINALS,
  type EnvironmentId,
  type ExternalTerminalId,
} from "@t3tools/contracts";
import { memo, useCallback, useMemo } from "react";
import { usePreferredTerminal } from "~/terminalPreferences";
import { shellEnvironment } from "~/state/shell";
import { useAtomCommand } from "~/state/use-atom-command";
import {
  AlacrittyIcon,
  GhosttyIcon,
  GnomeTerminalIcon,
  ITermIcon,
  KittyIcon,
  KonsoleIcon,
  TerminalAppIcon,
  WarpIcon,
  WezTermIcon,
  WindowsTerminalIcon,
  type Icon,
} from "../Icons";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const TERMINAL_ICONS = {
  "terminal-app": TerminalAppIcon,
  iterm: ITermIcon,
  ghostty: GhosttyIcon,
  warp: WarpIcon,
  wezterm: WezTermIcon,
  alacritty: AlacrittyIcon,
  kitty: KittyIcon,
  "windows-terminal": WindowsTerminalIcon,
  "gnome-terminal": GnomeTerminalIcon,
  konsole: KonsoleIcon,
} as const satisfies Record<ExternalTerminalId, Icon>;

const resolveOptions = (availableTerminals: ReadonlyArray<ExternalTerminalId>) => {
  const availableTerminalSet = new Set(availableTerminals);
  return EXTERNAL_TERMINALS.filter((terminal) => availableTerminalSet.has(terminal.id)).map(
    (terminal) => ({
      ...terminal,
      Icon: TERMINAL_ICONS[terminal.id],
    }),
  );
};

export const OpenInTerminalPicker = memo(function OpenInTerminalPicker({
  environmentId,
  availableTerminals,
  openInCwd,
}: {
  environmentId: EnvironmentId;
  availableTerminals: ReadonlyArray<ExternalTerminalId>;
  openInCwd: string | null;
}) {
  const openInTerminalMutation = useAtomCommand(shellEnvironment.openInTerminal, "open terminal");
  const [preferredTerminal] = usePreferredTerminal(availableTerminals);
  const options = useMemo(() => resolveOptions(availableTerminals), [availableTerminals]);
  const primaryOption = options.find(({ id }) => id === preferredTerminal) ?? null;
  const PrimaryIcon = primaryOption?.Icon ?? TerminalAppIcon;

  const openInTerminal = useCallback(() => {
    if (!openInCwd || !preferredTerminal) return;
    return openInTerminalMutation({
      environmentId,
      input: {
        cwd: openInCwd,
        terminal: preferredTerminal,
      },
    });
  }, [environmentId, openInCwd, openInTerminalMutation, preferredTerminal]);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={
              primaryOption ? `Open in ${primaryOption.label}` : "Open folder in preferred terminal"
            }
            size="icon-xs"
            variant="outline"
            disabled={!preferredTerminal || !openInCwd}
            onClick={openInTerminal}
          />
        }
      >
        <PrimaryIcon aria-hidden="true" className="size-3.5" />
      </TooltipTrigger>
      <TooltipPopup side="bottom">
        {primaryOption ? `Open in ${primaryOption.label}` : "No terminal configured"}
      </TooltipPopup>
    </Tooltip>
  );
});
