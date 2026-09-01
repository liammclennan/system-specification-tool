import { describe, expect, it } from "vitest";
import type { Claim, NodeRecord, Project, VerificationStatus } from "../shared/types.ts";
import { verificationReport } from "./report.ts";

const claim = (shortId: string, verification: VerificationStatus, ignored = false): Claim => ({ id: shortId, shortId, nodeId: "node", text: `${shortId} claim`, verification, ignored });
const node = (name: string, claims: Claim[], children: NodeRecord[] = []): NodeRecord => ({ id: name, shortId: name, name, parentId: null, content: "", claims, children, directClaimCount: claims.length, recursiveClaimCount: claims.length, verifiedClaimCount: 0, failedClaimCount: 0, ignoredClaimCount: 0, verification: "unverified" });
const project = (tree: NodeRecord): Project => ({ id: "system", name: "system", rootNodeId: tree.id, tree, testResults: [] });

describe("verificationReport", () => {
  it("reports outstanding claims with their node and exits with code 1", () => {
    const result = verificationReport(project(node("System", [claim("ok", "verified"), claim("skip", "failed", true)], [node("Payments", [claim("bad", "failed"), claim("todo", "unverified")])])));
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Failing claims: 1\nUnverified claims: 1\nIgnored claims: 1\nVerified claims: 1");
    expect(result.output).toContain("- Failing — Payments: [bad] bad claim");
    expect(result.output).toContain("- Unverified — Payments: [todo] todo claim");
  });

  it("exits with code 0 when every claim is verified or ignored", () => {
    const result = verificationReport(project(node("System", [claim("ok", "verified"), claim("skip", "unverified", true)])));
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("Failing and unverified claims:");
  });
});
