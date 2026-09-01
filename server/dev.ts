import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HELP_TEXT, isHelpRequested, resolveStartupConfiguration } from "./startup.ts";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const executable = (name: string) => join(packageRoot, "node_modules", ".bin", name);
const projectArgument = process.argv.slice(2);
if (isHelpRequested(projectArgument)) { console.log(HELP_TEXT); process.exit(0); }
try {
  resolveStartupConfiguration(projectArgument, process.env.SYSTEM_SPECIFICATION_TOOL_PROJECT, process.cwd(), process.env.SYSTEM_SPECIFICATION_TOOL_PORT, process.env.SYSTEM_SPECIFICATION_TOOL_TEST_RESULTS);
} catch (error) {
  console.error(`Error: ${(error as Error).message}\n\n${HELP_TEXT}`);
  process.exit(1);
}
const portArgument = projectArgument.find((arg) => arg.startsWith("--port="))?.slice("--port=".length) ?? (() => { const index = projectArgument.indexOf("--port"); return index >= 0 ? projectArgument[index + 1] : undefined; })();
const server = spawn(executable("tsx"), ["watch", join(packageRoot, "server/index.ts"), "--", ...projectArgument], { cwd: process.cwd(), stdio: "inherit", env: { ...process.env, SYSTEM_SPECIFICATION_TOOL_DEV: "true", SYSTEM_SPECIFICATION_TOOL_BROWSER_MANAGED: "true" } });
const frontendPort = portArgument ?? process.env.SYSTEM_SPECIFICATION_TOOL_PORT;

const browserPort = frontendPort ?? "5173";
const browserUrl = `http://localhost:${browserPort}/`;
setTimeout(() => {
  if (process.platform === "darwin") spawn("open", [browserUrl], { detached: true, stdio: "ignore" }).unref();
  else if (process.platform === "win32") spawn("cmd", ["/c", "start", "", browserUrl], { detached: true, stdio: "ignore" }).unref();
  else spawn("xdg-open", [browserUrl], { detached: true, stdio: "ignore" }).unref();
}, 750);

function stop(exitCode = 0) {
  if (!server.killed) server.kill("SIGTERM");
  process.exit(exitCode);
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
server.on("exit", (code) => stop(code ?? 1));
