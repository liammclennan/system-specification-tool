import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { resolveStartupConfiguration } from "./startup.ts";

describe("resolveStartupConfiguration", () => {
  it("uses the configured workspace when no project argument is supplied", () => {
    expect(resolveStartupConfiguration([], "/repositories", undefined, "/workspace/specification")).toEqual({ workspaceRoot: "/workspace", initialProject: "specification", initialProjectPath: "/workspace/specification", port: 5173, apiPort: 3001 });
  });
  it("uses a project argument as the initial project and scopes the workspace to its parent", () => {
    expect(resolveStartupConfiguration(["/repositories/payments-spec"])).toEqual({ workspaceRoot: "/repositories", initialProject: "payments-spec", initialProjectPath: "/repositories/payments-spec", port: 5173, apiPort: 3001 });
  });
  it("accepts the --project option used by the command-line executable", () => {
    expect(resolveStartupConfiguration(["--project=/repositories/payments-spec"])).toEqual({ workspaceRoot: "/repositories", initialProject: "payments-spec", initialProjectPath: "/repositories/payments-spec", port: 5173, apiPort: 3001 });
  });
  it("uses the environment project when no command-line project is supplied", () => {
    expect(resolveStartupConfiguration([], undefined, "/repositories/from-env", "/workspace")).toEqual({ workspaceRoot: "/repositories", initialProject: "from-env", initialProjectPath: "/repositories/from-env", port: 5173, apiPort: 3001 });
  });
  it("resolves relative project arguments from the caller's working directory", () => {
    expect(resolveStartupConfiguration(["--project=projects/demo"], "/workspace")).toEqual({ workspaceRoot: resolve("projects"), initialProject: "demo", initialProjectPath: resolve("projects/demo"), port: 5173, apiPort: 3001 });
  });
  it("accepts a validated --port argument", () => {
    expect(resolveStartupConfiguration(["--port=4123"], undefined, undefined, "/workspace").port).toBe(4123);
    expect(() => resolveStartupConfiguration(["--port=70000"])).toThrow(/Port/);
  });
  it("accepts the renamed port environment variable", () => {
    expect(resolveStartupConfiguration([], undefined, undefined, "/workspace", "4567").port).toBe(4567);
  });
  it("accepts a separate API port", () => {
    expect(resolveStartupConfiguration(["--api-port=4124"], undefined, undefined, "/workspace").apiPort).toBe(4124);
    expect(resolveStartupConfiguration([], undefined, undefined, "/workspace", undefined, "4125").apiPort).toBe(4125);
  });
});
