import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("command-line print mode", () => {
  it.each([false, true])(
    "reports invalid project directories cleanly (print: %s)",
    async (print) => {
      const root = await mkdtemp(join(tmpdir(), "spec-tool-invalid-"));
      roots.push(root);
      const projectPath = join(root, "invalid-project");
      await mkdir(projectPath);
      await writeFile(join(projectPath, "specification.json"), "{}");
      const run = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          resolve("server/index.ts"),
          "--project",
          projectPath,
          ...(print ? ["--print", "--test-results", root] : []),
        ],
        {
          encoding: "utf8",
          env: { ...process.env, SYSTEM_SPECIFICATION_TOOL_BROWSER_MANAGED: "true" },
          timeout: 20_000,
        },
      );
      expect(run.error).toBeUndefined();
      expect(run.status).toBe(1);
      expect(run.stderr).toContain(`Error: Cannot open project directory "${projectPath}"`);
      expect(run.stderr).toContain("invalid specification.json");
      expect(run.stderr).toContain("Use --project <path>");
      expect(run.stderr).not.toMatch(/\n\s+at /);
      expect(run.stdout).not.toContain("listening at");
    },
    25_000,
  );

  it("0971 c905 verifies and prints non-interactively without starting a web server", async () => {
    const root = await mkdtemp(join(tmpdir(), "spec-tool-print-"));
    roots.push(root);
    const projectPath = join(root, "print-project");
    const resultsPath = join(root, "results");
    await mkdir(projectPath);
    await mkdir(resultsPath);
    const run = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve("server/index.ts"),
        "--print",
        projectPath,
        "--test-results",
        resultsPath,
        "--port",
        "43129",
      ],
      {
        cwd: resolve("."),
        encoding: "utf8",
        env: { ...process.env, SYSTEM_SPECIFICATION_TOOL_BROWSER_MANAGED: "true" },
        timeout: 20_000,
      },
    );
    expect(run.error).toBeUndefined();
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("Failing claims: 0");
    expect(run.stdout).toContain("Unverified claims: 0");
    expect(run.stdout).toContain("Ignored claims: 0");
    expect(run.stdout).toContain("Verified claims: 0");
    expect(run.stdout).not.toContain("listening at");
    expect(await readFile(join(projectPath, "specification.md"), "utf8")).toContain(
      "# print-project",
    );
  }, 25_000);
});
