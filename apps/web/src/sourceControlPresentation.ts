import { GitPullRequestIcon } from "lucide-react";
import type { ElementType } from "react";
import type {
  ChangeRequestChecksSummary,
  ChangeRequestMergeStatus,
  ChangeRequestReviewDecision,
  ChangeRequestState,
  SourceControlProviderInfo,
} from "@t3tools/contracts";
export {
  DEFAULT_CHANGE_REQUEST_TERMINOLOGY,
  formatChangeRequestAction,
  formatCreateChangeRequestPhrase,
  getChangeRequestTerminology,
  resolveChangeRequestPresentation,
  type ChangeRequestPresentation,
  type ChangeRequestTerminology,
} from "@t3tools/shared/sourceControl";
import {
  getChangeRequestTerminology,
  resolveChangeRequestPresentation,
  type ChangeRequestTerminology,
} from "@t3tools/shared/sourceControl";
import { AzureDevOpsIcon, BitbucketIcon, GitHubIcon, GitLabIcon } from "./components/Icons";

export interface SourceControlPresentation {
  readonly providerName: string;
  readonly terminology: ChangeRequestTerminology;
  readonly Icon: ElementType<{ className?: string }>;
}

export function getChangeRequestStateColorClass(state: ChangeRequestState): string {
  switch (state) {
    case "open":
      return "text-success-foreground";
    case "closed":
      return "text-muted-foreground";
    case "merged":
      return "text-purple-400";
  }
}

export interface ChangeRequestStatusInput {
  readonly state: ChangeRequestState;
  readonly isDraft?: boolean | undefined;
  readonly mergeStatus?: ChangeRequestMergeStatus | undefined;
  readonly reviewDecision?: ChangeRequestReviewDecision | undefined;
  readonly checks?: ChangeRequestChecksSummary | undefined;
}

export function getChangeRequestStatusDisplay(input: ChangeRequestStatusInput): {
  readonly label: string;
  readonly colorClass: string;
} {
  if (input.state !== "open") {
    return {
      label: input.state,
      colorClass: getChangeRequestStateColorClass(input.state),
    };
  }

  if (input.mergeStatus === "conflicting") {
    return { label: "conflicts", colorClass: "text-destructive-foreground" };
  }
  if (input.checks?.status === "failing") {
    return { label: "checks failing", colorClass: "text-destructive-foreground" };
  }
  if (input.reviewDecision === "changes_requested") {
    return { label: "changes requested", colorClass: "text-destructive-foreground" };
  }
  if (input.mergeStatus === "blocked") {
    return { label: "blocked", colorClass: "text-warning-foreground" };
  }
  if (input.isDraft || input.mergeStatus === "draft") {
    return { label: "draft", colorClass: "text-warning-foreground" };
  }
  if (input.mergeStatus === "behind") {
    return { label: "behind", colorClass: "text-warning-foreground" };
  }
  if (input.mergeStatus === "unstable") {
    return { label: "unstable", colorClass: "text-warning-foreground" };
  }
  if (input.reviewDecision === "review_required") {
    return { label: "review required", colorClass: "text-warning-foreground" };
  }
  if (input.checks?.status === "pending") {
    return { label: "checks pending", colorClass: "text-warning-foreground" };
  }

  return { label: "open", colorClass: getChangeRequestStateColorClass(input.state) };
}

export function getSourceControlPresentation(
  provider: SourceControlProviderInfo | null | undefined,
): SourceControlPresentation {
  const presentation = resolveChangeRequestPresentation(provider);
  switch (presentation.icon) {
    case "github":
      return {
        providerName: provider?.name || presentation.providerName,
        terminology: getChangeRequestTerminology(provider),
        Icon: GitHubIcon,
      };
    case "gitlab":
      return {
        providerName: provider?.name || presentation.providerName,
        terminology: getChangeRequestTerminology(provider),
        Icon: GitLabIcon,
      };
    case "azure-devops":
      return {
        providerName: provider?.name || presentation.providerName,
        terminology: getChangeRequestTerminology(provider),
        Icon: AzureDevOpsIcon,
      };
    case "bitbucket":
      return {
        providerName: provider?.name || presentation.providerName,
        terminology: getChangeRequestTerminology(provider),
        Icon: BitbucketIcon,
      };
    case "change-request":
      return {
        providerName: provider?.name || presentation.providerName,
        terminology: getChangeRequestTerminology(provider),
        Icon: GitPullRequestIcon,
      };
  }
}
