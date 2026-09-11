import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveStartupConfiguration } from "./startup.ts";

describe("resolveStartupConfiguration", () => {
  const workspace = resolve("workspace");
  const repositories = resolve("repositories");
  const results = join(workspace, "results");
  it("derives the workspace from the current directory when no project is supplied 946c", () => {
    expect(
      resolveStartupConfiguration(
        ["--test-results", results],
        undefined,
        join(workspace, "specification"),
      ),
    ).toEqual({
      workspaceRoot: workspace,
      initialProject: "specification",
      initialProjectPath: join(workspace, "specification"),
      port: 5173,
      testResultsPath: results,
    });
  });
  it("1760 uses a project argument as the initial project and scopes the workspace to its parent", () => {
    expect(
      resolveStartupConfiguration([join(repositories, "payments-spec"), "--test-results", results]),
    ).toMatchObject({
      workspaceRoot: repositories,
      initialProject: "payments-spec",
      initialProjectPath: join(repositories, "payments-spec"),
      testResultsPath: results,
    });
  });
  it("accepts the --project option used by the command-line executable 1760", () => {
    expect(
      resolveStartupConfiguration([
        `--project=${join(repositories, "payments-spec")}`,
        `--test-results=${results}`,
      ]),
    ).toMatchObject({
      workspaceRoot: repositories,
      initialProject: "payments-spec",
      initialProjectPath: join(repositories, "payments-spec"),
      testResultsPath: results,
    });
  });
  it("uses the environment project when no command-line project is supplied 3177", () => {
    expect(
      resolveStartupConfiguration(
        [`--test-results=${results}`],
        join(repositories, "from-env"),
        workspace,
      ),
    ).toMatchObject({
      workspaceRoot: repositories,
      initialProject: "from-env",
      initialProjectPath: join(repositories, "from-env"),
      testResultsPath: results,
    });
  });
  it("resolves relative project arguments from the caller's working directory", () => {
    expect(
      resolveStartupConfiguration(
        ["--project=projects/demo", "--test-results=results"],
        undefined,
        workspace,
      ),
    ).toMatchObject({
      workspaceRoot: join(workspace, "projects"),
      initialProject: "demo",
      initialProjectPath: join(workspace, "projects", "demo"),
      testResultsPath: results,
    });
  });
  it("accepts a validated --port argument", () => {
    expect(
      resolveStartupConfiguration(
        ["--port=4123", `--test-results=${results}`],
        undefined,
        workspace,
      ).port,
    ).toBe(4123);
    expect(() =>
      resolveStartupConfiguration(["--port=70000", `--test-results=${results}`]),
    ).toThrow(/Port/);
  });
  it("accepts the renamed port environment variable", () => {
    expect(
      resolveStartupConfiguration([`--test-results=${results}`], undefined, workspace, "4567").port,
    ).toBe(4567);
  });
  it("allows verification to be disabled by omitting test results", () => {
    expect(resolveStartupConfiguration([], undefined, workspace).testResultsPath).toBeUndefined();
  });
  it("accepts the test results environment variable", () => {
    expect(
      resolveStartupConfiguration([], undefined, workspace, undefined, "reports").testResultsPath,
    ).toBe(join(workspace, "reports"));
  });
});
