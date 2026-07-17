import { bind, setEnabled } from "cuelume";
import { useEffect } from "react";

import { useClientSettings, useClientSettingsHydrated } from "../hooks/useSettings";

export function InteractionSounds() {
  const hydrated = useClientSettingsHydrated();
  const interactionSounds = useClientSettings((settings) => settings.interactionSounds);

  useEffect(() => {
    const enabled = hydrated && interactionSounds;
    setEnabled(enabled);
    if (enabled) bind();
  }, [hydrated, interactionSounds]);

  return null;
}
