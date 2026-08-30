export type VerificationStatus = "unverified" | "verified" | "failed";

export interface Claim {
  id: string;
  shortId: string;
  nodeId: string;
  text: string;
  verification: VerificationStatus;
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
  verification: VerificationStatus;
}

export interface Project {
  id: string;
  name: string;
  rootNodeId: string;
  tree: NodeRecord;
  testResults: TestResultsFile[];
}

export interface TestResultsFile {
  id: string;
  fileName: string;
}
