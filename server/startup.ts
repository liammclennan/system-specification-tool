import { basename, dirname, resolve } from "node:path";

export interface StartupConfiguration {
  workspaceRoot: string;
  initialProject?: string;
  initialProjectPath?: string;
  port: number;
  apiPort: number;
}

/** A positional argument names one project directory to open on startup. */
export function resolveStartupConfiguration(args: string[], _configuredWorkspace?: string, environmentProject?: string, callerDirectory = process.cwd(), configuredPort?: string, configuredApiPort?: string): StartupConfiguration {
  const portArgument = args.find((arg) => arg.startsWith("--port="))?.slice("--port=".length) ?? (() => { const index = args.indexOf("--port"); return index >= 0 ? args[index + 1] : undefined; })();
  const apiPortArgument = args.find((arg) => arg.startsWith("--api-port="))?.slice("--api-port=".length) ?? (() => { const index = args.indexOf("--api-port"); return index >= 0 ? args[index + 1] : undefined; })();
  const port = Number(portArgument ?? configuredPort ?? 5173); const apiPort = Number(apiPortArgument ?? configuredApiPort ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) throw new Error("Ports must be integers between 1 and 65535");
  const namedProject = args.find((arg) => arg.startsWith("--project="))?.slice("--project=".length) ?? (() => {
    const index = args.indexOf("--project"); return index >= 0 ? args[index + 1] : undefined;
  })();
  const projectPath = namedProject || args.find((arg) => !arg.startsWith("-")) || environmentProject || callerDirectory;
  const absoluteProjectPath = resolve(callerDirectory, projectPath);
  return { workspaceRoot: dirname(absoluteProjectPath), initialProject: basename(absoluteProjectPath), initialProjectPath: absoluteProjectPath, port, apiPort };
}
