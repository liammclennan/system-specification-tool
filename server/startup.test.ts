import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { resolveStartupConfiguration } from "./startup.ts";

describe("resolveStartupConfiguration", () => {
  it("uses the configured workspace when no project argument is supplied", () => {
    expect(resolveStartupConfiguration([], "/repositories", undefined, "/workspace/specification")).toEqual({ workspaceRoot: "/workspace", initialProject: "specification", initialProjectPath: "/workspace/specification" });
  });
  it("uses a project argument as the initial project and scopes the workspace to its parent", () => {
    expect(resolveStartupConfiguration(["/repositories/payments-spec"])).toEqual({ workspaceRoot: "/repositories", initialProject: "payments-spec", initialProjectPath: "/repositories/payments-spec" });
  });
  it("accepts the --project option used by the command-line executable", () => {
    expect(resolveStartupConfiguration(["--project=/repositories/payments-spec"])).toEqual({ workspaceRoot: "/repositories", initialProject: "payments-spec", initialProjectPath: "/repositories/payments-spec" });
  });
  it("uses the environment project when no command-line project is supplied", () => {
    expect(resolveStartupConfiguration([], undefined, "/repositories/from-env", "/workspace")).toEqual({ workspaceRoot: "/repositories", initialProject: "from-env", initialProjectPath: "/repositories/from-env" });
  });
  it("resolves relative project arguments from the caller's working directory", () => {
    expect(resolveStartupConfiguration(["--project=projects/demo"], "/workspace")).toEqual({ workspaceRoot: resolve("projects"), initialProject: "demo", initialProjectPath: resolve("projects/demo") });
  });
});
