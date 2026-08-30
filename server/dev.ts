import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const executable = (name: string) => join(packageRoot, "node_modules", ".bin", name);
const projectArgument = process.argv.slice(2);
const portArgument = projectArgument.find((arg) => arg.startsWith("--port="))?.slice("--port=".length) ?? (() => { const index = projectArgument.indexOf("--port"); return index >= 0 ? projectArgument[index + 1] : undefined; })();
const server = spawn(executable("tsx"), ["watch", join(packageRoot, "server/index.ts"), "--", ...projectArgument], { cwd: process.cwd(), stdio: "inherit" });
const frontendPort = portArgument ?? process.env.SYSTEM_SPECIFICATION_TOOL_PORT;
const apiPortArgument = projectArgument.find((arg) => arg.startsWith("--api-port="))?.slice("--api-port=".length) ?? (() => { const index = projectArgument.indexOf("--api-port"); return index >= 0 ? projectArgument[index + 1] : undefined; })();
const apiPort = apiPortArgument ?? process.env.SYSTEM_SPECIFICATION_TOOL_API_PORT ?? "3001";
const client = spawn(executable("vite"), ["--config", join(packageRoot, "vite.config.ts"), ...(frontendPort ? ["--port", frontendPort] : [])], { cwd: packageRoot, stdio: "inherit", env: { ...process.env, API_PORT: apiPort } });
const children = [server, client];

const browserPort = frontendPort ?? "5173";
const browserUrl = `http://localhost:${browserPort}/`;
setTimeout(() => {
  if (process.platform === "darwin") spawn("open", [browserUrl], { detached: true, stdio: "ignore" }).unref();
  else if (process.platform === "win32") spawn("cmd", ["/c", "start", "", browserUrl], { detached: true, stdio: "ignore" }).unref();
  else spawn("xdg-open", [browserUrl], { detached: true, stdio: "ignore" }).unref();
}, 750);

function stop(exitCode = 0) {
  children.forEach((child) => { if (!child.killed) child.kill("SIGTERM"); });
  process.exit(exitCode);
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
server.on("exit", (code) => stop(code ?? 1));
client.on("exit", (code) => stop(code ?? 1));
