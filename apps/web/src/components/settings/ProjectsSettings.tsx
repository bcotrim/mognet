import { scopedProjectKey, scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  DEFAULT_MODEL,
  defaultInstanceIdForDriver,
  ProviderDriverKind,
  type ModelSelection,
  type ProjectDefaultThreadEnvMode,
  type ProviderInstanceId,
  type ProviderOptionSelection,
  type ServerProvider,
} from "@t3tools/contracts";
import type { UnifiedSettings } from "@t3tools/contracts/settings";
import { createModelSelection } from "@t3tools/shared/model";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useEnvironmentSettings } from "../../hooks/useSettings";
import {
  getCustomModelOptionsByInstance,
  resolveAppModelSelectionForInstance,
} from "../../modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import { useEnvironments } from "../../state/environments";
import { useProjects, useServerConfigs } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
import { modelSelectionsEqual } from "../ChatView.logic";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { TraitsPicker } from "../chat/TraitsPicker";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

const DEFAULT_DRIVER_KIND = ProviderDriverKind.make("codex");

type ProjectOption = {
  key: string;
  project: EnvironmentProject;
  environmentLabel: string | null;
};

function projectKey(project: EnvironmentProject): string {
  return scopedProjectKey(scopeProjectRef(project.environmentId, project.id));
}

function fallbackProjectModelSelection(): ModelSelection {
  return createModelSelection(defaultInstanceIdForDriver(DEFAULT_DRIVER_KIND), DEFAULT_MODEL);
}

function projectOptionTitle(option: ProjectOption): string {
  return option.project.title || option.project.workspaceRoot;
}

function projectOptionDescription(option: ProjectOption): string {
  return option.environmentLabel
    ? `${option.environmentLabel} · ${option.project.workspaceRoot}`
    : option.project.workspaceRoot;
}

function chooseProjectModelEntry(input: {
  entries: ReadonlyArray<ProviderInstanceEntry>;
  selection: ModelSelection | null | undefined;
}): ProviderInstanceEntry | null {
  const configuredEntry = input.selection
    ? input.entries.find(
        (entry) =>
          entry.instanceId === input.selection?.instanceId && entry.enabled && entry.isAvailable,
      )
    : null;
  return (
    configuredEntry ??
    input.entries.find((entry) => entry.enabled && entry.isAvailable) ??
    input.entries.find((entry) => entry.enabled) ??
    input.entries[0] ??
    null
  );
}

function resolveProjectModelSelection(input: {
  entries: ReadonlyArray<ProviderInstanceEntry>;
  providers: ReadonlyArray<ServerProvider>;
  settings: UnifiedSettings;
  selection: ModelSelection | null | undefined;
}): {
  selection: ModelSelection;
  entry: ProviderInstanceEntry | null;
  provider: ProviderDriverKind;
} {
  const entry = chooseProjectModelEntry(input);
  if (!entry) {
    return {
      selection: input.selection ?? fallbackProjectModelSelection(),
      entry: null,
      provider: DEFAULT_DRIVER_KIND,
    };
  }

  const keepsConfiguredEntry = input.selection?.instanceId === entry.instanceId;
  const model =
    resolveAppModelSelectionForInstance(
      entry.instanceId,
      input.settings,
      input.providers,
      keepsConfiguredEntry ? input.selection?.model : null,
    ) ??
    entry.models[0]?.slug ??
    input.selection?.model ??
    DEFAULT_MODEL;

  return {
    selection: createModelSelection(
      entry.instanceId,
      model,
      keepsConfiguredEntry ? input.selection?.options : undefined,
    ),
    entry,
    provider: entry.driverKind,
  };
}

export function ProjectsSettingsPanel() {
  const projects = useProjects();
  const { environments } = useEnvironments();
  const [selectedProjectKey, setSelectedProjectKey] = useState<string | null>(null);
  const environmentLabelById = useMemo(
    () =>
      new Map(
        environments.map((environment) => [environment.environmentId, environment.label] as const),
      ),
    [environments],
  );
  const projectOptions = useMemo<ReadonlyArray<ProjectOption>>(
    () =>
      projects
        .filter((project) => project.kind === "workspace")
        .map((project) => ({
          key: projectKey(project),
          project,
          environmentLabel: environmentLabelById.get(project.environmentId) ?? null,
        }))
        .sort((left, right) => {
          const titleCompare = projectOptionTitle(left).localeCompare(projectOptionTitle(right));
          if (titleCompare !== 0) return titleCompare;
          return projectOptionDescription(left).localeCompare(projectOptionDescription(right));
        }),
    [environmentLabelById, projects],
  );
  const projectOptionByKey = useMemo(
    () => new Map(projectOptions.map((option) => [option.key, option] as const)),
    [projectOptions],
  );
  const effectiveSelectedProjectKey =
    selectedProjectKey && projectOptionByKey.has(selectedProjectKey)
      ? selectedProjectKey
      : (projectOptions[0]?.key ?? null);
  const selectedProjectOption = effectiveSelectedProjectKey
    ? (projectOptionByKey.get(effectiveSelectedProjectKey) ?? null)
    : null;

  useEffect(() => {
    if (selectedProjectKey !== effectiveSelectedProjectKey) {
      setSelectedProjectKey(effectiveSelectedProjectKey);
    }
  }, [effectiveSelectedProjectKey, selectedProjectKey]);

  return (
    <SettingsPageContainer>
      <SettingsSection title="Projects">
        {selectedProjectOption ? (
          <SettingsRow
            title="Project"
            description={projectOptionDescription(selectedProjectOption)}
            control={
              projectOptions.length > 1 ? (
                <ProjectSelect
                  options={projectOptions}
                  selectedKey={effectiveSelectedProjectKey ?? selectedProjectOption.key}
                  onChange={setSelectedProjectKey}
                />
              ) : (
                <span className="truncate text-xs font-medium text-muted-foreground">
                  {projectOptionTitle(selectedProjectOption)}
                </span>
              )
            }
          />
        ) : (
          <SettingsRow
            title="No projects"
            description="Add a workspace project before changing project-specific settings."
          />
        )}

        {selectedProjectOption ? <ProjectDefaultsSettings option={selectedProjectOption} /> : null}
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function ProjectSelect({
  options,
  selectedKey,
  onChange,
}: {
  options: ReadonlyArray<ProjectOption>;
  selectedKey: string;
  onChange: (key: string) => void;
}) {
  const selectedOption = options.find((option) => option.key === selectedKey) ?? options[0];

  return (
    <Select
      value={selectedKey}
      onValueChange={(value) => {
        if (value) {
          onChange(value);
        }
      }}
    >
      <SelectTrigger className="w-full sm:w-72" aria-label="Project">
        <SelectValue>
          {selectedOption ? projectOptionTitle(selectedOption) : "Select project"}
        </SelectValue>
      </SelectTrigger>
      <SelectPopup align="end" alignItemWithTrigger={false} popupClassName="w-80">
        {options.map((option) => (
          <SelectItem hideIndicator key={option.key} value={option.key}>
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{projectOptionTitle(option)}</span>
              <span className="truncate text-xs text-muted-foreground">
                {projectOptionDescription(option)}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

type ProjectSettingsPatch = Partial<
  Pick<
    EnvironmentProject,
    | "defaultModelSelection"
    | "defaultThreadEnvMode"
    | "newWorktreesStartFromOrigin"
    | "textGenerationModelSelection"
  >
>;

function ProjectDefaultsSettings({ option }: { option: ProjectOption }) {
  const { project } = option;
  const settings = useEnvironmentSettings(project.environmentId);
  const serverConfigs = useServerConfigs();
  const updateProject = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  const [optimisticPatch, setOptimisticPatch] = useState<ProjectSettingsPatch>({});
  const providers = serverConfigs.get(project.environmentId)?.providers ?? [];
  const projectSettings = { ...project, ...optimisticPatch };

  useEffect(() => {
    setOptimisticPatch({});
  }, [
    project.defaultModelSelection,
    project.defaultThreadEnvMode,
    project.environmentId,
    project.id,
    project.newWorktreesStartFromOrigin,
    project.textGenerationModelSelection,
  ]);

  const instanceEntries = useMemo(
    () =>
      sortProviderInstanceEntries(
        applyProviderInstanceSettings(deriveProviderInstanceEntries(providers), settings),
      ),
    [providers, settings],
  );

  const persistProjectPatch = useCallback(
    async (patch: ProjectSettingsPatch) => {
      setOptimisticPatch((current) => ({ ...current, ...patch }));
      const result = await updateProject({
        environmentId: project.environmentId,
        input: {
          projectId: project.id,
          ...patch,
        },
      });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        setOptimisticPatch({});
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to update project settings",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      }
    },
    [project.environmentId, project.id, updateProject],
  );

  const persistDefaultModelSelection = useCallback(
    (nextSelection: ModelSelection) => {
      if (modelSelectionsEqual(projectSettings.defaultModelSelection, nextSelection)) {
        return;
      }
      void persistProjectPatch({ defaultModelSelection: nextSelection });
    },
    [persistProjectPatch, projectSettings.defaultModelSelection],
  );

  const persistTextGenerationModelSelection = useCallback(
    (nextSelection: ModelSelection) => {
      if (modelSelectionsEqual(projectSettings.textGenerationModelSelection, nextSelection)) {
        return;
      }
      void persistProjectPatch({ textGenerationModelSelection: nextSelection });
    },
    [persistProjectPatch, projectSettings.textGenerationModelSelection],
  );

  const handleThreadEnvModeChange = useCallback(
    (defaultThreadEnvMode: ProjectDefaultThreadEnvMode) => {
      void persistProjectPatch({ defaultThreadEnvMode });
    },
    [persistProjectPatch],
  );

  const handleStartFromOriginChange = useCallback(
    (checked: boolean) => {
      void persistProjectPatch({ newWorktreesStartFromOrigin: checked });
    },
    [persistProjectPatch],
  );

  return (
    <>
      <SettingsRow
        title="New threads"
        description="Choose whether new threads start in the project checkout or a new worktree."
        status={option.environmentLabel ? `Environment: ${option.environmentLabel}` : null}
        control={
          <Select
            value={projectSettings.defaultThreadEnvMode}
            onValueChange={(value) => {
              if (value === "local" || value === "worktree") {
                handleThreadEnvModeChange(value);
              }
            }}
          >
            <SelectTrigger className="w-full sm:w-44" aria-label="Project default thread mode">
              <SelectValue>
                {projectSettings.defaultThreadEnvMode === "worktree" ? "New worktree" : "Local"}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem hideIndicator value="local">
                Local
              </SelectItem>
              <SelectItem hideIndicator value="worktree">
                New worktree
              </SelectItem>
            </SelectPopup>
          </Select>
        }
      />

      {projectSettings.defaultThreadEnvMode === "worktree" ? (
        <SettingsRow
          className="bg-muted/20 sm:pl-9"
          title="Start from origin"
          description="Create new worktrees from the latest matching branch on origin instead of your local branch."
          control={
            <Switch
              checked={projectSettings.newWorktreesStartFromOrigin}
              onCheckedChange={(checked) => handleStartFromOriginChange(Boolean(checked))}
              aria-label="Start new project worktrees from origin"
            />
          }
        />
      ) : null}

      <SettingsRow
        title="Default model"
        description="Used as the starting model for new threads in this project."
        control={
          <ProjectModelSelectionControl
            settings={settings}
            providers={providers}
            instanceEntries={instanceEntries}
            selection={projectSettings.defaultModelSelection}
            onSelectionChange={persistDefaultModelSelection}
          />
        }
      />

      <SettingsRow
        title="Text generation model"
        description="Used for generated thread titles, worktree branch names, and similar project text."
        control={
          <ProjectModelSelectionControl
            settings={settings}
            providers={providers}
            instanceEntries={instanceEntries}
            selection={projectSettings.textGenerationModelSelection}
            onSelectionChange={persistTextGenerationModelSelection}
          />
        }
      />
    </>
  );
}

function ProjectModelSelectionControl({
  settings,
  providers,
  instanceEntries,
  selection,
  onSelectionChange,
}: {
  settings: UnifiedSettings;
  providers: ReadonlyArray<ServerProvider>;
  instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  selection: ModelSelection | null | undefined;
  onSelectionChange: (selection: ModelSelection) => void;
}) {
  const modelState = useMemo(
    () =>
      resolveProjectModelSelection({
        entries: instanceEntries,
        providers,
        settings,
        selection,
      }),
    [instanceEntries, providers, selection, settings],
  );

  const modelOptionsByInstance = useMemo(
    () =>
      getCustomModelOptionsByInstance(
        settings,
        providers,
        modelState.selection.instanceId,
        modelState.selection.model,
      ),
    [modelState.selection.instanceId, modelState.selection.model, providers, settings],
  );

  const handleModelChange = useCallback(
    (instanceId: ProviderInstanceId, model: string) => {
      const resolvedModel =
        resolveAppModelSelectionForInstance(instanceId, settings, providers, model) ?? model;
      onSelectionChange(createModelSelection(instanceId, resolvedModel));
    },
    [onSelectionChange, providers, settings],
  );

  const handleModelOptionsChange = useCallback(
    (nextOptions: ReadonlyArray<ProviderOptionSelection> | undefined) => {
      onSelectionChange(
        createModelSelection(
          modelState.selection.instanceId,
          modelState.selection.model,
          nextOptions,
        ),
      );
    },
    [modelState.selection.instanceId, modelState.selection.model, onSelectionChange],
  );

  return (
    <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:justify-end">
      <ProviderModelPicker
        activeInstanceId={modelState.selection.instanceId}
        model={modelState.selection.model}
        lockedProvider={null}
        instanceEntries={instanceEntries}
        modelOptionsByInstance={modelOptionsByInstance}
        triggerVariant="outline"
        triggerClassName="min-w-0 max-w-none shrink-0 text-foreground/90 hover:text-foreground"
        disabled={instanceEntries.length === 0}
        onInstanceModelChange={handleModelChange}
      />
      <TraitsPicker
        provider={modelState.provider}
        instanceId={modelState.selection.instanceId}
        models={modelState.entry?.models ?? []}
        model={modelState.selection.model}
        prompt=""
        onPromptChange={() => {}}
        modelOptions={modelState.selection.options}
        allowPromptInjectedEffort={false}
        triggerVariant="outline"
        triggerClassName="min-w-0 max-w-none shrink-0 text-foreground/90 hover:text-foreground"
        onModelOptionsChange={handleModelOptionsChange}
      />
    </div>
  );
}
