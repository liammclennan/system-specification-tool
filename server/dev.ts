import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const executable = (name: string) => join(packageRoot, "node_modules", ".bin", name);
const projectArgument = process.argv.slice(2);
const server = spawn(executable("tsx"), ["watch", join(packageRoot, "server/index.ts"), "--", ...projectArgument], { cwd: process.cwd(), stdio: "inherit" });
const client = spawn(executable("vite"), ["--config", join(packageRoot, "vite.config.ts")], { cwd: packageRoot, stdio: "inherit" });
const children = [server, client];

function stop(exitCode = 0) {
  children.forEach((child) => { if (!child.killed) child.kill("SIGTERM"); });
  process.exit(exitCode);
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
server.on("exit", (code) => stop(code ?? 1));
client.on("exit", (code) => stop(code ?? 1));
