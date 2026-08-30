import { basename, dirname, resolve } from "node:path";

export interface StartupConfiguration {
  workspaceRoot: string;
  initialProject?: string;
  initialProjectPath?: string;
  port: number;
  apiPort: number;
  testResultsPath: string;
}

export const HELP_TEXT = `System Specification Tool

Usage:
  system-specification-tool [options]

Options:
  --project <path>       Specification directory (defaults to the current directory)
  --test-results <path>  Test result file or directory (required unless the environment variable is set)
  --port <number>        Front-end server port (default: 5173)
  --api-port <number>    API server port (default: 3001)
  --help                 Show this help message

Environment:
  SYSTEM_SPECIFICATION_TOOL_PROJECT
  SYSTEM_SPECIFICATION_TOOL_TEST_RESULTS
  SYSTEM_SPECIFICATION_TOOL_PORT
  SYSTEM_SPECIFICATION_TOOL_API_PORT`;

export function isHelpRequested(args: string[]) {
  return args.includes("--help") || args.includes("-h");
}

/** A positional argument names one project directory to open on startup. */
export function resolveStartupConfiguration(args: string[], _configuredWorkspace?: string, environmentProject?: string, callerDirectory = process.cwd(), configuredPort?: string, configuredApiPort?: string, environmentTestResults?: string): StartupConfiguration {
  const portArgument = args.find((arg) => arg.startsWith("--port="))?.slice("--port=".length) ?? (() => { const index = args.indexOf("--port"); return index >= 0 ? args[index + 1] : undefined; })();
  const apiPortArgument = args.find((arg) => arg.startsWith("--api-port="))?.slice("--api-port=".length) ?? (() => { const index = args.indexOf("--api-port"); return index >= 0 ? args[index + 1] : undefined; })();
  const port = Number(portArgument ?? configuredPort ?? 5173); const apiPort = Number(apiPortArgument ?? configuredApiPort ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) throw new Error("Ports must be integers between 1 and 65535");
  const namedProject = args.find((arg) => arg.startsWith("--project="))?.slice("--project=".length) ?? (() => {
    const index = args.indexOf("--project"); return index >= 0 ? args[index + 1] : undefined;
  })();
  const optionValues = new Set<string>();
  for (const option of ["--project", "--test-results", "--port", "--api-port"]) { const index = args.indexOf(option); if (index >= 0 && args[index + 1]) optionValues.add(args[index + 1]); }
  const positional = args.find((arg) => !arg.startsWith("-") && !optionValues.has(arg));
  const projectPath = namedProject || positional || environmentProject || callerDirectory;
  const testResultsArgument = args.find((arg) => arg.startsWith("--test-results="))?.slice("--test-results=".length) ?? (() => { const index = args.indexOf("--test-results"); return index >= 0 ? args[index + 1] : undefined; })() ?? environmentTestResults;
  if (!testResultsArgument) throw new Error("The --test-results option or SYSTEM_SPECIFICATION_TOOL_TEST_RESULTS environment variable is required");
  const absoluteProjectPath = resolve(callerDirectory, projectPath);
  return { workspaceRoot: dirname(absoluteProjectPath), initialProject: basename(absoluteProjectPath), initialProjectPath: absoluteProjectPath, port, apiPort, testResultsPath: resolve(callerDirectory, testResultsArgument) };
}
