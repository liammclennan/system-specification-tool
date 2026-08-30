#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const tsx = join(packageRoot, "node_modules", ".bin", "tsx");
const child = spawn(tsx, [join(packageRoot, "server/dev.ts"), "--", ...process.argv.slice(2)], { cwd: process.cwd(), stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
