export type VerificationStatus = "unverified" | "verified" | "failed";

export interface Claim {
  id: string;
  shortId: string;
  nodeId: string;
  text: string;
  verification: VerificationStatus;
  ignored: boolean;
}

export interface NodeRecord {
  id: string;
  shortId: string;
  name: string;
  parentId: string | null;
  content: string;
  claims: Claim[];
  children: NodeRecord[];
  directClaimCount: number;
  recursiveClaimCount: number;
  verifiedClaimCount: number;
  failedClaimCount: number;
  ignoredClaimCount: number;
  verification: VerificationStatus;
}

export interface Project {
  id: string;
  name: string;
  rootNodeId: string;
  tree: NodeRecord;
  /** @deprecated retained for persisted legacy projects; uploads are no longer exposed by the UI/API. */
  testResults: TestResultsFile[];
}
export interface TestResultsFile {
  id: string;
  fileName: string;
}
export interface VerificationTest {
  name: string;
  status: "passed" | "failed" | "ignored";
}
export interface VerificationTestFile {
  fileName: string;
  modifiedAt: string;
  tests: VerificationTest[];
}

export function findNode(node: NodeRecord, id: string): NodeRecord | undefined {
  return node.id === id ? node : node.children.map((child) => findNode(child, id)).find(Boolean);
}
export function allNodeIds(node: NodeRecord): string[] {
  return [node.id, ...node.children.flatMap(allNodeIds)];
}
export function countFailedClaims(node: NodeRecord): number {
  return (
    node.claims.filter((claim) => claim.verification === "failed").length +
    node.children.reduce((total, child) => total + countFailedClaims(child), 0)
  );
}
export function countIgnoredClaims(node: NodeRecord): number {
  return (
    node.claims.filter((claim) => claim.ignored).length +
    node.children.reduce((total, child) => total + countIgnoredClaims(child), 0)
  );
}
