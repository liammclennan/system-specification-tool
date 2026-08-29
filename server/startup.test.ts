import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { resolveStartupConfiguration } from "./startup.ts";

describe("resolveStartupConfiguration", () => {
  it("uses the configured workspace when no project argument is supplied", () => {
    expect(resolveStartupConfiguration([], "/repositories")).toEqual({ workspaceRoot: resolve("/repositories") });
  });
  it("uses a project argument as the initial project and scopes the workspace to its parent", () => {
    expect(resolveStartupConfiguration(["/repositories/payments-spec"])).toEqual({ workspaceRoot: "/repositories", initialProject: "payments-spec" });
  });
  it("accepts the --project option used by the command-line executable", () => {
    expect(resolveStartupConfiguration(["--project=/repositories/payments-spec"])).toEqual({ workspaceRoot: "/repositories", initialProject: "payments-spec" });
  });
});
