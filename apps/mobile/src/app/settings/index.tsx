import { Link, Stack } from "expo-router";
import { SymbolView } from "expo-symbols";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/AppText";
import { useThemeColor } from "../../lib/useThemeColor";
import { useSavedRemoteConnections } from "../../state/use-remote-environment-registry";

export default function SettingsRouteScreen() {
  const insets = useSafeAreaInsets();
  const { savedConnectionsById } = useSavedRemoteConnections();
  const environmentCount = Object.keys(savedConnectionsById).length;

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      <Stack.Screen options={{ title: "Settings" }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{
          gap: 24,
          paddingBottom: Math.max(insets.bottom, 18) + 18,
          paddingHorizontal: 20,
          paddingTop: 16,
        }}
      >
        <SettingsSection title="Configuration">
          <SettingsRow
            icon="desktopcomputer"
            label="Environments"
            value={`${environmentCount}`}
            href="/settings/environments"
          />
        </SettingsSection>

        <ArchivedThreadsSettingsSection />

        <AppSettingsSection />
      </ScrollView>
    </View>
  );
}

type SymbolName = ComponentProps<typeof SymbolView>["name"];

function SettingsSection(props: { readonly title: string; readonly children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="px-2 text-sm font-t3-medium text-foreground-muted">{props.title}</Text>
      <View
        className="overflow-hidden rounded-[28px] bg-card"
        style={{ borderCurve: "continuous" }}
      >
        {props.children}
      </View>
    </View>
  );
}

function AppSettingsSection() {
  const icon = useThemeColor("--color-icon");

  return (
    <SettingsSection title="App">
      <View className="flex-row items-center gap-4 p-4">
        <SymbolView
          name="info.circle"
          size={22}
          tintColor={icon}
          type="monochrome"
          weight="regular"
        />
        <Text className="flex-1 text-lg text-foreground">Version</Text>
        <Text className="text-lg text-foreground-muted">Mognet</Text>
      </View>
    </SettingsSection>
  );
}

function ArchivedThreadsSettingsSection() {
  return (
    <SettingsSection title="Threads">
      <SettingsRow icon="archivebox" label="Archived Threads" href="/settings/archive" />
    </SettingsSection>
  );
}

function SettingsRow(props: {
  readonly icon: SymbolName;
  readonly label: string;
  readonly value?: string;
  readonly href: "/settings/archive" | "/settings/environments";
}) {
  const icon = useThemeColor("--color-icon");
  const chevron = useThemeColor("--color-chevron");

  return (
    <Link href={props.href} asChild>
      <Pressable accessibilityLabel={props.label} accessibilityRole="button">
        <View className="flex-row items-center gap-4 p-4">
          <SymbolView
            name={props.icon}
            size={22}
            tintColor={icon}
            type="monochrome"
            weight="regular"
          />
          <Text className="shrink-0 text-lg text-foreground" numberOfLines={1}>
            {props.label}
          </Text>
          <View className="min-w-0 flex-1 items-end">
            {props.value ? (
              <Text
                className="max-w-[180px] text-right text-base text-foreground-muted"
                ellipsizeMode="middle"
                numberOfLines={1}
              >
                {props.value}
              </Text>
            ) : null}
          </View>
          <SymbolView
            name="chevron.right"
            size={16}
            tintColor={chevron}
            type="monochrome"
            weight="semibold"
          />
        </View>
      </Pressable>
    </Link>
  );
}
