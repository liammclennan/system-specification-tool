#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
if (process.argv.slice(2).some((arg) => arg === "--help" || arg === "-h")) {
  console.log(
    `System Specification Tool\n\nUsage:\n  system-specification-tool [options]\n\nOptions:\n  --project <path>       Specification directory (defaults to the current directory)\n  --test-results <path>  Test result file or directory (enables verification)\n  --port <number>        Web server port (default: 5173)\n  --print                Verify, print a claim report, and exit without starting the server\n  --help                 Show this help message\n  --version              Show the installed version\n\nEnvironment:\n  SYSTEM_SPECIFICATION_TOOL_PROJECT\n  SYSTEM_SPECIFICATION_TOOL_TEST_RESULTS\n  SYSTEM_SPECIFICATION_TOOL_PORT`,
  );
  process.exit(0);
}
if (process.argv.slice(2).includes("--version")) {
  console.log(JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).version);
  process.exit(0);
}
const tsx = fileURLToPath(import.meta.resolve("tsx/cli"));
const child = spawn(
  process.execPath,
  [tsx, join(packageRoot, "server/index.ts"), ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, SYSTEM_SPECIFICATION_TOOL_DEV: "true" },
  },
);
child.on("error", (error) => {
  console.error(`Error: Could not start System Specification Tool: ${error.message}`);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 1));
