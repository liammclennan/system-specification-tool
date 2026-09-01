#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
if (process.argv.slice(2).some((arg) => arg === "--help" || arg === "-h")) {
  console.log(`System Specification Tool\n\nUsage:\n  system-specification-tool [options]\n\nOptions:\n  --project <path>       Specification directory (defaults to the current directory)\n  --test-results <path>  Test result file or directory (required unless the environment variable is set)\n  --port <number>        Web server port (default: 5173)\n  --help                 Show this help message\n\nEnvironment:\n  SYSTEM_SPECIFICATION_TOOL_PROJECT\n  SYSTEM_SPECIFICATION_TOOL_TEST_RESULTS\n  SYSTEM_SPECIFICATION_TOOL_PORT`);
  process.exit(0);
}
const tsx = join(packageRoot, "node_modules", ".bin", "tsx");
const child = spawn(tsx, [join(packageRoot, "server/dev.ts"), "--", ...process.argv.slice(2)], { cwd: process.cwd(), stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
