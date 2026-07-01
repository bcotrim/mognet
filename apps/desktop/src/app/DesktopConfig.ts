import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Option from "effect/Option";

const trimNonEmptyOption = (value: string): Option.Option<string> => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? Option.some(trimmed) : Option.none();
};

const trimmedString = (name: string) =>
  Config.string(name).pipe(Config.option, Config.map(Option.flatMap(trimNonEmptyOption)));

const optionalPort = (name: string) => Config.port(name).pipe(Config.option);
const optionalInt = (name: string) => Config.int(name).pipe(Config.option);
const optionalBooleanValue = (name: string) => Config.boolean(name).pipe(Config.option);

const compactEnv = (env: Readonly<Record<string, string | undefined>>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );

export const DesktopConfig = Config.all({
  appDataDirectory: trimmedString("APPDATA"),
  xdgConfigHome: trimmedString("XDG_CONFIG_HOME"),
  t3Home: trimmedString("MOGNET_HOME"),
  devServerUrl: Config.url("VITE_DEV_SERVER_URL").pipe(Config.option),
  appUserModelIdOverride: trimmedString("MOGNET_DESKTOP_APP_USER_MODEL_ID"),
  devRemoteServerEntryPath: trimmedString("MOGNET_DEV_REMOTE_SERVER_ENTRY_PATH"),
  configuredBackendPort: optionalPort("MOGNET_PORT"),
  commitHashOverride: trimmedString("MOGNET_COMMIT_HASH"),
  desktopLanHostOverride: trimmedString("MOGNET_DESKTOP_LAN_HOST"),
  desktopHttpsEndpointUrls: trimmedString("MOGNET_DESKTOP_HTTPS_ENDPOINTS").pipe(
    Config.map(
      Option.match({
        onNone: () => [],
        onSome: (value) =>
          value
            .split(",")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0),
      }),
    ),
  ),
  otlpTracesUrl: trimmedString("MOGNET_OTLP_TRACES_URL"),
  otlpExportIntervalMs: optionalInt("MOGNET_OTLP_EXPORT_INTERVAL_MS").pipe(
    Config.map(Option.getOrElse(() => 10_000)),
  ),
  appImagePath: trimmedString("APPIMAGE"),
  disableAutoUpdate: optionalBooleanValue("MOGNET_DISABLE_AUTO_UPDATE").pipe(
    Config.map(Option.getOrElse(() => false)),
  ),
  mockUpdates: optionalBooleanValue("MOGNET_DESKTOP_MOCK_UPDATES").pipe(
    Config.map(Option.getOrElse(() => false)),
  ),
  mockUpdateServerPort: optionalPort("MOGNET_DESKTOP_MOCK_UPDATE_SERVER_PORT").pipe(
    Config.map(Option.getOrElse(() => 3000)),
  ),
});

export const layerTest = (env: Readonly<Record<string, string | undefined>>) =>
  ConfigProvider.layer(ConfigProvider.fromEnv({ env: compactEnv(env) }));
