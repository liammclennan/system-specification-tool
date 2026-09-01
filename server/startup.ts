import { basename, dirname, resolve } from "node:path";

export interface StartupConfiguration {
  workspaceRoot: string;
  initialProject?: string;
  initialProjectPath?: string;
  port: number;
  testResultsPath: string;
}

export const HELP_TEXT = `System Specification Tool

Usage:
  system-specification-tool [options]

Options:
  --project <path>       Specification directory (defaults to the current directory)
  --test-results <path>  Test result file or directory (required unless the environment variable is set)
  --port <number>        Web server port (default: 5173)
  --help                 Show this help message

Environment:
  SYSTEM_SPECIFICATION_TOOL_PROJECT
  SYSTEM_SPECIFICATION_TOOL_TEST_RESULTS
  SYSTEM_SPECIFICATION_TOOL_PORT`;

export function isHelpRequested(args: string[]) {
  return args.includes("--help") || args.includes("-h");
}

/** A positional argument names one project directory to open on startup. */
export function resolveStartupConfiguration(args: string[], environmentProject?: string, callerDirectory = process.cwd(), configuredPort?: string, environmentTestResults?: string): StartupConfiguration {
  const portArgument = args.find((arg) => arg.startsWith("--port="))?.slice("--port=".length) ?? (() => { const index = args.indexOf("--port"); return index >= 0 ? args[index + 1] : undefined; })();
  const port = Number(portArgument ?? configuredPort ?? 5173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port must be an integer between 1 and 65535");
  const namedProject = args.find((arg) => arg.startsWith("--project="))?.slice("--project=".length) ?? (() => {
    const index = args.indexOf("--project"); return index >= 0 ? args[index + 1] : undefined;
  })();
  const optionValues = new Set<string>();
  for (const option of ["--project", "--test-results", "--port"]) { const index = args.indexOf(option); if (index >= 0 && args[index + 1]) optionValues.add(args[index + 1]); }
  const positional = args.find((arg) => !arg.startsWith("-") && !optionValues.has(arg));
  const projectPath = namedProject || positional || environmentProject || callerDirectory;
  const testResultsArgument = args.find((arg) => arg.startsWith("--test-results="))?.slice("--test-results=".length) ?? (() => { const index = args.indexOf("--test-results"); return index >= 0 ? args[index + 1] : undefined; })() ?? environmentTestResults;
  if (!testResultsArgument) throw new Error("The --test-results option or SYSTEM_SPECIFICATION_TOOL_TEST_RESULTS environment variable is required");
  const absoluteProjectPath = resolve(callerDirectory, projectPath);
  return { workspaceRoot: dirname(absoluteProjectPath), initialProject: basename(absoluteProjectPath), initialProjectPath: absoluteProjectPath, port, testResultsPath: resolve(callerDirectory, testResultsArgument) };
}
