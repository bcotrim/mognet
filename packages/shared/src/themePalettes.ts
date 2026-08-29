export const BUILT_IN_THEME_IDS = ["mognet", "grove", "ocean", "ember", "iris"] as const;

export type BuiltInThemeId = (typeof BUILT_IN_THEME_IDS)[number];

/**
 * Ids a theme may not take: the appearance keywords a stored preference uses,
 * every built-in, and the legacy aliases older saves still carry. Taking one
 * would either be shadowed by the built-in or capture clients that never chose
 * it, so the client library and the publish path both consult this set.
 */
export const RESERVED_THEME_IDS: ReadonlySet<string> = new Set([
  "system",
  "light",
  "dark",
  ...BUILT_IN_THEME_IDS,
  "mognet-dark",
  "mognet-grove",
  "mognet-ocean",
  "mognet-ember",
  "mognet-iris",
]);

export const UNPUBLISHABLE_THEME_IDS: ReadonlySet<string> = RESERVED_THEME_IDS;
