import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Schema from "effect/Schema";
import * as SecureStore from "expo-secure-store";
import { EnvironmentId } from "@t3tools/contracts";

import { type SavedRemoteConnection, toStableSavedRemoteConnection } from "./connection";

const CONNECTIONS_KEY = "mognet.connections";
const PREFERENCES_KEY = "mognet.preferences";
const LEGACY_CONNECTIONS_KEY = "t3code.connections";
const LEGACY_PREFERENCES_KEY = "t3code.preferences";
const MobileStorageKey = Schema.Literals([
  CONNECTIONS_KEY,
  PREFERENCES_KEY,
  LEGACY_CONNECTIONS_KEY,
  LEGACY_PREFERENCES_KEY,
]);
type MobileStorageKeyValue = typeof MobileStorageKey.Type;

export class MobileSecureStorageError extends Schema.TaggedErrorClass<MobileSecureStorageError>()(
  "MobileSecureStorageError",
  {
    operation: Schema.Literals(["read", "write", "delete"]),
    key: MobileStorageKey,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Mobile secure storage operation ${this.operation} failed for key ${this.key}.`;
  }
}

export class MobileStorageDecodeError extends Schema.TaggedErrorClass<MobileStorageDecodeError>()(
  "MobileStorageDecodeError",
  {
    key: MobileStorageKey,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to decode mobile storage value for key ${this.key}.`;
  }
}

export class MobileStorageEncodeError extends Schema.TaggedErrorClass<MobileStorageEncodeError>()(
  "MobileStorageEncodeError",
  {
    key: MobileStorageKey,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to encode mobile storage value for key ${this.key}.`;
  }
}

export interface Preferences {
  readonly terminalFontSize?: number;
}

async function readStorageItem(key: MobileStorageKeyValue): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (cause) {
    throw new MobileSecureStorageError({ operation: "read", key, cause });
  }
}

async function writeStorageItem(key: MobileStorageKeyValue, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (cause) {
    throw new MobileSecureStorageError({ operation: "write", key, cause });
  }
}

async function deleteStorageItem(key: MobileStorageKeyValue): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (cause) {
    throw new MobileSecureStorageError({ operation: "delete", key, cause });
  }
}

async function readJsonStorageItem<T>(key: MobileStorageKeyValue): Promise<T | null> {
  const raw = (await readStorageItem(key)) ?? "";
  if (!raw.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (cause) {
    console.warn(
      "[mobile-storage] ignored invalid JSON",
      new MobileStorageDecodeError({ key, cause }),
    );
    return null;
  }
}

async function writeJsonStorageItem(key: MobileStorageKeyValue, value: unknown) {
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch (cause) {
    throw new MobileStorageEncodeError({ key, cause });
  }
  await writeStorageItem(key, encoded);
}

async function readJsonStorageItemWithLegacy<T>(
  key: MobileStorageKeyValue,
  legacyKey: MobileStorageKeyValue,
): Promise<T | null> {
  const current = await readJsonStorageItem<T>(key);
  if (current !== null) {
    return current;
  }

  const legacy = await readJsonStorageItem<T>(legacyKey);
  if (legacy === null) {
    return null;
  }

  try {
    await writeJsonStorageItem(key, legacy);
    await deleteStorageItem(legacyKey);
  } catch {
    // Best-effort migration: keep using the legacy value if secure-store cleanup fails.
  }
  return legacy;
}

export async function loadSavedConnections(): Promise<ReadonlyArray<SavedRemoteConnection>> {
  const parsed = await readJsonStorageItemWithLegacy<{
    readonly connections?: ReadonlyArray<SavedRemoteConnection>;
  }>(CONNECTIONS_KEY, LEGACY_CONNECTIONS_KEY);
  if (!parsed) {
    return [];
  }

  return pipe(
    parsed.connections ?? [],
    Arr.filter((c) => !!c.environmentId && !!c.bearerToken?.trim()),
  );
}

export async function saveConnection(connection: SavedRemoteConnection): Promise<void> {
  const current = await loadSavedConnections();
  const stableConnection = toStableSavedRemoteConnection(connection);
  const next = current.some((entry) => entry.environmentId === connection.environmentId)
    ? pipe(
        current,
        Arr.map((entry) =>
          entry.environmentId === connection.environmentId ? stableConnection : entry,
        ),
      )
    : pipe(current, Arr.append(stableConnection));

  await writeJsonStorageItem(CONNECTIONS_KEY, { connections: next });
}

export async function clearSavedConnection(environmentId: EnvironmentId): Promise<void> {
  const current = await loadSavedConnections();
  const next = pipe(
    current,
    Arr.filter((entry) => entry.environmentId !== environmentId),
  );
  await writeJsonStorageItem(CONNECTIONS_KEY, { connections: next });
}

export async function loadPreferences(): Promise<Preferences> {
  const parsed = await readJsonStorageItemWithLegacy<Preferences>(
    PREFERENCES_KEY,
    LEGACY_PREFERENCES_KEY,
  );
  if (!parsed || typeof parsed !== "object") {
    return {};
  }

  const preferences: {
    terminalFontSize?: number;
  } = {};

  if (typeof parsed.terminalFontSize === "number") {
    preferences.terminalFontSize = parsed.terminalFontSize;
  }

  return preferences;
}

export async function savePreferencesPatch(patch: Partial<Preferences>): Promise<Preferences> {
  const current = await loadPreferences();
  const next: Preferences = {
    ...current,
    ...patch,
  };
  await writeJsonStorageItem(PREFERENCES_KEY, next);
  return next;
}
