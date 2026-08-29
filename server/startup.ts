import { basename, dirname, resolve } from "node:path";

export interface StartupConfiguration {
  workspaceRoot: string;
  initialProject?: string;
}

/** A positional argument names one project directory to open on startup. */
export function resolveStartupConfiguration(args: string[], configuredWorkspace?: string): StartupConfiguration {
  const namedProject = args.find((arg) => arg.startsWith("--project="))?.slice("--project=".length) ?? (() => {
    const index = args.indexOf("--project"); return index >= 0 ? args[index + 1] : undefined;
  })();
  const projectPath = namedProject || args.find((arg) => !arg.startsWith("-"));
  if (!projectPath) return { workspaceRoot: resolve(configuredWorkspace ?? "./projects") };
  const absoluteProjectPath = resolve(projectPath);
  return { workspaceRoot: dirname(absoluteProjectPath), initialProject: basename(absoluteProjectPath) };
}
