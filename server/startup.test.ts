import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { resolveStartupConfiguration } from "./startup.ts";

describe("resolveStartupConfiguration", () => {
  const results = "/workspace/results";
  it("uses the configured workspace when no project argument is supplied", () => {
    expect(resolveStartupConfiguration(["--test-results", results], "/repositories", undefined, "/workspace/specification")).toEqual({ workspaceRoot: "/workspace", initialProject: "specification", initialProjectPath: "/workspace/specification", port: 5173, apiPort: 3001, testResultsPath: results });
  });
  it("uses a project argument as the initial project and scopes the workspace to its parent", () => {
    expect(resolveStartupConfiguration(["/repositories/payments-spec", "--test-results", "/results"])).toMatchObject({ workspaceRoot: "/repositories", initialProject: "payments-spec", initialProjectPath: "/repositories/payments-spec", testResultsPath: "/results" });
  });
  it("accepts the --project option used by the command-line executable", () => {
    expect(resolveStartupConfiguration(["--project=/repositories/payments-spec", "--test-results=/results"])).toMatchObject({ workspaceRoot: "/repositories", initialProject: "payments-spec", initialProjectPath: "/repositories/payments-spec", testResultsPath: "/results" });
  });
  it("uses the environment project when no command-line project is supplied", () => {
    expect(resolveStartupConfiguration(["--test-results=/results"], undefined, "/repositories/from-env", "/workspace")).toMatchObject({ workspaceRoot: "/repositories", initialProject: "from-env", initialProjectPath: "/repositories/from-env", testResultsPath: "/results" });
  });
  it("resolves relative project arguments from the caller's working directory", () => {
    expect(resolveStartupConfiguration(["--project=projects/demo", "--test-results=results"], "/workspace")).toMatchObject({ workspaceRoot: resolve("projects"), initialProject: "demo", initialProjectPath: resolve("projects/demo"), testResultsPath: resolve("results") });
  });
  it("accepts a validated --port argument", () => {
    expect(resolveStartupConfiguration(["--port=4123", "--test-results=/results"], undefined, undefined, "/workspace").port).toBe(4123);
    expect(() => resolveStartupConfiguration(["--port=70000", "--test-results=/results"])).toThrow(/Port/);
  });
  it("accepts the renamed port environment variable", () => {
    expect(resolveStartupConfiguration(["--test-results=/results"], undefined, undefined, "/workspace", "4567").port).toBe(4567);
  });
  it("accepts a separate API port", () => {
    expect(resolveStartupConfiguration(["--api-port=4124", "--test-results=/results"], undefined, undefined, "/workspace").apiPort).toBe(4124);
    expect(resolveStartupConfiguration(["--test-results=/results"], undefined, undefined, "/workspace", undefined, "4125").apiPort).toBe(4125);
  });
  it("requires test results path", () => { expect(() => resolveStartupConfiguration([])).toThrow(/test-results/); });
  it("accepts the test results environment variable", () => {
    expect(resolveStartupConfiguration([], undefined, undefined, "/workspace", undefined, undefined, "reports").testResultsPath).toBe("/workspace/reports");
  });
});
