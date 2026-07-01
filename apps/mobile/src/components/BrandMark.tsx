import { View } from "react-native";

import { AppText as Text } from "./AppText";

export function BrandMark(props: { readonly compact?: boolean; readonly stageLabel?: string }) {
  const compact = props.compact ?? false;
  const stageLabel = props.stageLabel?.trim();

  return (
    <View className="flex-row items-center gap-3">
      <View className="h-8 justify-center">
        <Text className="font-mono text-xl text-primary">~ $</Text>
      </View>
      <View className="gap-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-lg font-t3-bold text-foreground" style={{ letterSpacing: 0 }}>
            mognet
          </Text>
          {stageLabel ? (
            <View className="rounded-[5px] border border-border bg-subtle px-2 py-1">
              <Text
                className="font-mono text-3xs uppercase text-foreground-muted"
                style={{ letterSpacing: 1.1 }}
              >
                {stageLabel}
              </Text>
            </View>
          ) : null}
        </View>
        {!compact ? (
          <Text className="text-xs font-medium text-foreground-muted">
            Mobile control surface for your live coding environments
          </Text>
        ) : null}
      </View>
    </View>
  );
}
