import type { ProjectScript } from "@t3tools/contracts";

interface ProjectScriptRuntimeEnvInput {
  project: {
    cwd: string;
  };
  worktreePath?: string | null;
  extraEnv?: Record<string, string>;
}

export function projectScriptCwd(input: {
  project: {
    cwd: string;
  };
  worktreePath?: string | null;
}): string {
  return input.worktreePath ?? input.project.cwd;
}

export function projectScriptRuntimeEnv(
  input: ProjectScriptRuntimeEnvInput,
): Record<string, string> {
  const extraEnv = input.extraEnv ?? {};
  const projectRoot = extraEnv.MOGNET_PROJECT_ROOT ?? input.project.cwd;
  const worktreePath = extraEnv.MOGNET_WORKTREE_PATH ?? input.worktreePath;
  const env: Record<string, string> = {
    ...extraEnv,
    MOGNET_PROJECT_ROOT: projectRoot,
  };
  if (worktreePath) {
    env.MOGNET_WORKTREE_PATH = worktreePath;
  } else {
    delete env.MOGNET_WORKTREE_PATH;
  }
  return env;
}

export function setupProjectScript(scripts: readonly ProjectScript[]): ProjectScript | null {
  return scripts.find((script) => script.runOnWorktreeCreate) ?? null;
}
