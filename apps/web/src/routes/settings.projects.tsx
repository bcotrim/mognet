import { createFileRoute } from "@tanstack/react-router";

import { ProjectsSettingsPanel } from "../components/settings/ProjectsSettings";

export const Route = createFileRoute("/settings/projects")({
  component: ProjectsSettingsPanel,
});
