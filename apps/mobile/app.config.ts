import type { ExpoConfig } from "expo/config";

type AppVariant = "development" | "preview" | "production";

const APP_VARIANT = resolveAppVariant(process.env.APP_VARIANT);

const VARIANT_CONFIG: Record<
  AppVariant,
  {
    readonly appName: string;
    readonly scheme: string;
    readonly iosIcon: string;
    readonly iosBundleIdentifier: string;
    readonly androidPackage: string;
  }
> = {
  development: {
    appName: "Mognet Dev",
    scheme: "mognet-dev",
    iosIcon: "./assets/icon.png",
    iosBundleIdentifier: "app.mognet.mobile.dev",
    androidPackage: "app.mognet.mobile.dev",
  },
  preview: {
    appName: "Mognet Preview",
    scheme: "mognet-preview",
    iosIcon: "./assets/icon.png",
    iosBundleIdentifier: "app.mognet.mobile.preview",
    androidPackage: "app.mognet.mobile.preview",
  },
  production: {
    appName: "Mognet",
    scheme: "mognet",
    iosIcon: "./assets/icon.png",
    iosBundleIdentifier: "app.mognet.mobile",
    androidPackage: "app.mognet.mobile",
  },
};

function resolveAppVariant(value: string | undefined): AppVariant {
  switch (value) {
    case "development":
    case "preview":
    case "production":
      return value;
    default:
      return "production";
  }
}

const variant = VARIANT_CONFIG[APP_VARIANT];

const config: ExpoConfig = {
  name: variant.appName,
  slug: "mognet",
  platforms: ["ios", "android"],
  scheme: variant.scheme,
  version: "0.1.0",
  runtimeVersion: {
    policy: process.env.MOBILE_VERSION_POLICY ?? "appVersion",
  },
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  updates: {
    enabled: true,
    url: "https://u.expo.dev/d763fcb8-d37c-41ea-a773-b54a0ab4a454",
    checkAutomatically: "ON_LOAD",
    fallbackToCacheTimeout: 0,
  },
  ios: {
    icon: variant.iosIcon,
    supportsTablet: true,
    bundleIdentifier: variant.iosBundleIdentifier,
    infoPlist: {
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
      },
      NSLocalNetworkUsageDescription:
        "Allow Mognet to connect to Mognet servers on your local network or tailnet.",
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    icon: "./assets/icon.png",
    package: variant.androidPackage,
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-secure-store",
    "expo-web-browser",
    [
      "expo-camera",
      {
        cameraPermission: "Allow Mognet to access your camera so you can scan pairing QR codes.",
        barcodeScannerEnabled: true,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        imageWidth: 220,
        dark: {
          image: "./assets/splash-icon.png",
          backgroundColor: "#0a0a0a",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        ios: {
          deploymentTarget: "18.0",
        },
      },
    ],
    "./plugins/withAndroidCleartextTraffic.cjs",
  ],
  extra: {
    appVariant: APP_VARIANT,
    eas: {
      projectId: "d763fcb8-d37c-41ea-a773-b54a0ab4a454",
    },
  },
  owner: "pingdotgg",
};

export default config;
