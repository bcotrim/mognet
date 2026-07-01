import type { ApprovalRequestId, ProviderApprovalDecision } from "@t3tools/contracts";
import { Pressable, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import type { PendingApproval } from "../../lib/threadActivity";

export interface PendingApprovalCardProps {
  readonly approval: PendingApproval;
  readonly respondingApprovalId: ApprovalRequestId | null;
  readonly onRespond: (
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<unknown>;
}

export function PendingApprovalCard(props: PendingApprovalCardProps) {
  return (
    <View className="gap-2.5 rounded-[14px] border border-border bg-card p-4">
      <Text className="font-mono text-2xs uppercase tracking-[1.1px] text-primary">
        Approval needed
      </Text>
      <Text className="font-t3-bold text-lg text-foreground">{props.approval.requestKind}</Text>
      {props.approval.detail ? (
        <Text className="font-sans text-sm leading-5 text-foreground-muted">
          {props.approval.detail}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap gap-2.5">
        <Pressable
          className="items-center justify-center rounded-[7px] bg-primary px-3.5 py-3"
          disabled={props.respondingApprovalId === props.approval.requestId}
          onPress={() => void props.onRespond(props.approval.requestId, "accept")}
        >
          <Text className="font-t3-extrabold text-sm text-primary-foreground">Allow once</Text>
        </Pressable>
        <Pressable
          className="items-center justify-center rounded-[7px] bg-subtle px-3.5 py-3"
          disabled={props.respondingApprovalId === props.approval.requestId}
          onPress={() => void props.onRespond(props.approval.requestId, "acceptForSession")}
        >
          <Text className="font-t3-bold text-sm text-foreground">Allow session</Text>
        </Pressable>
        <Pressable
          className="items-center justify-center rounded-[7px] bg-danger px-3.5 py-3"
          disabled={props.respondingApprovalId === props.approval.requestId}
          onPress={() => void props.onRespond(props.approval.requestId, "decline")}
        >
          <Text className="font-t3-bold text-sm text-danger-foreground">Decline</Text>
        </Pressable>
      </View>
    </View>
  );
}
