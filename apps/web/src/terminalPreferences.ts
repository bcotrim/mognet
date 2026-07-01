import { EXTERNAL_TERMINALS, type ExternalTerminalId } from "@t3tools/contracts";
import { useCallback, useMemo } from "react";
import { useClientSettings, useUpdateClientSettings } from "./hooks/useSettings";

export function resolvePreferredTerminal(
  defaultTerminal: ExternalTerminalId | null,
  availableTerminals: readonly ExternalTerminalId[],
): ExternalTerminalId | null {
  if (defaultTerminal && availableTerminals.includes(defaultTerminal)) return defaultTerminal;
  return (
    EXTERNAL_TERMINALS.find((terminal) => availableTerminals.includes(terminal.id))?.id ?? null
  );
}

export function usePreferredTerminal(availableTerminals: ReadonlyArray<ExternalTerminalId>) {
  const defaultTerminal = useClientSettings((settings) => settings.defaultTerminal);
  const updateClientSettings = useUpdateClientSettings();

  const effectiveTerminal = useMemo(
    () => resolvePreferredTerminal(defaultTerminal, availableTerminals),
    [availableTerminals, defaultTerminal],
  );

  const setPreferredTerminal = useCallback(
    (terminal: ExternalTerminalId | null) => {
      updateClientSettings({ defaultTerminal: terminal });
    },
    [updateClientSettings],
  );

  return [effectiveTerminal, setPreferredTerminal] as const;
}
