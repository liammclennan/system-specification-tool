import type { NodeRecord, Project } from "../shared/types.ts";

export interface VerificationReport {
  output: string;
  exitCode: 0 | 1;
}

export function verificationReport(project: Project): VerificationReport {
  const counts = { failing: 0, unverified: 0, ignored: 0, verified: 0 };
  const outstanding: string[] = [];
  const visit = (node: NodeRecord) => {
    for (const claim of node.claims) {
      if (claim.ignored) counts.ignored++;
      else if (claim.verification === "verified") counts.verified++;
      else if (claim.verification === "failed") {
        counts.failing++;
        outstanding.push(`- Failing — ${node.name}: [${claim.shortId}] ${claim.text.replace(/\s+/g, " ").trim()}`);
      } else {
        counts.unverified++;
        outstanding.push(`- Unverified — ${node.name}: [${claim.shortId}] ${claim.text.replace(/\s+/g, " ").trim()}`);
      }
    }
    node.children.forEach(visit);
  };
  visit(project.tree);
  const lines = [
    `Failing claims: ${counts.failing}`,
    `Unverified claims: ${counts.unverified}`,
    `Ignored claims: ${counts.ignored}`,
    `Verified claims: ${counts.verified}`,
  ];
  if (outstanding.length) lines.push("", "Failing and unverified claims:", ...outstanding);
  return { output: `${lines.join("\n")}\n`, exitCode: counts.failing || counts.unverified ? 1 : 0 };
}
