import { spawn } from "node:child_process";
import { resolve } from "node:path";

const executable = (name: string) => resolve("node_modules", ".bin", name);
const projectArgument = process.argv.slice(2);
const server = spawn(executable("tsx"), ["watch", "server/index.ts", "--", ...projectArgument], { stdio: "inherit" });
const client = spawn(executable("vite"), [], { stdio: "inherit" });
const children = [server, client];

function stop(exitCode = 0) {
  children.forEach((child) => { if (!child.killed) child.kill("SIGTERM"); });
  process.exit(exitCode);
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
server.on("exit", (code) => stop(code ?? 1));
client.on("exit", (code) => stop(code ?? 1));
