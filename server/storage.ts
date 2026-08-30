import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import type { Claim, NodeRecord, Project, TestResultsFile, VerificationStatus } from "../shared/types.ts";

type NodeMeta = { id: string; name: string; parentId: string | null };
type Manifest = { formatVersion: 1; rootNodeId: string };
type StoredClaim = Claim & { order: number };
type TestAssertion = { name: string; status: string };

function decodeXml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
function parseXunitAssertions(xml: string): TestAssertion[] {
  const assertions: TestAssertion[] = [];
  for (const match of xml.matchAll(/<(testcase|test-case|test)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:testcase|test-case|test)>)/gi)) {
    const nameMatch = match[2].match(/\bname\s*=\s*(["'])(.*?)\1/i);
    if (!nameMatch) continue;
    const body = match[3] ?? "";
    const resultMatch = match[2].match(/\b(?:result|status)\s*=\s*(["'])(.*?)\1/i);
    const result = resultMatch?.[2].toLowerCase();
    assertions.push({ name: decodeXml(nameMatch[2]), status: /<(?:failure|error)\b/i.test(body) || result === "fail" || result === "failed" || result === "error" ? "failed" : /<skipped\b/i.test(body) || result === "skip" || result === "skipped" || result === "notrun" ? "skipped" : result === "pass" || result === "passed" || result === "success" ? "passed" : "passed" });
  }
  return assertions;
}
function parseTrxAssertions(xml: string): TestAssertion[] {
  const assertions: TestAssertion[] = [];
  for (const match of xml.matchAll(/<UnitTestResult\b([^>]*?)(?:\/>|>([\s\S]*?)<\/UnitTestResult>)/gi)) {
    const nameMatch = match[1].match(/\btestName\s*=\s*(["'])(.*?)\1/i);
    const outcomeMatch = match[1].match(/\boutcome\s*=\s*(["'])(.*?)\1/i);
    if (!nameMatch) continue;
    const outcome = outcomeMatch?.[2].toLowerCase();
    assertions.push({ name: decodeXml(nameMatch[2]), status: outcome === "passed" ? "passed" : ["failed", "error", "timeout", "aborted"].includes(outcome ?? "") ? "failed" : "skipped" });
  }
  return assertions;
}
function parseTapAssertions(tap: string): TestAssertion[] {
  const assertions: TestAssertion[] = [];
  for (const line of tap.split(/\r?\n/)) {
    const match = line.trim().match(/^(not ok|ok)\b(?:\s+\d+)?(?:\s*-\s*)?(.*)$/i);
    if (!match) continue;
    const name = match[2].replace(/\s+#\s*(?:skip|todo)\b.*$/i, "").trim();
    const directive = match[2].match(/#\s*(skip|todo)\b/i);
    assertions.push({ name, status: directive ? "skipped" : match[1].toLowerCase() === "ok" ? "passed" : "failed" });
  }
  return assertions;
}
function parseCargoAssertions(output: string): TestAssertion[] {
  const assertions: TestAssertion[] = [];
  const clean = output.replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, "");
  for (const match of clean.matchAll(/^\s*test\s+(.+?)\s+\.\.\.\s+(ok|FAILED|ignored)\s*$/gim)) {
    assertions.push({ name: match[1].trim(), status: match[2].toLowerCase() === "ok" ? "passed" : match[2].toLowerCase() === "failed" ? "failed" : "skipped" });
  }
  return assertions;
}
function parseGoTestAssertions(output: string): TestAssertion[] {
  const assertions: TestAssertion[] = [];
  for (const line of output.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line) as { Action?: string; Test?: string };
      if (!event.Test || !event.Action) continue;
      const action = event.Action.toLowerCase();
      if (["pass", "fail", "skip"].includes(action)) assertions.push({ name: event.Test, status: action === "pass" ? "passed" : action === "fail" ? "failed" : "skipped" });
    } catch { /* Ignore non-event lines in JSON-lines output. */ }
  }
  return assertions;
}

export class StorageError extends Error { status = 400; }

export class ProjectStorage {
  constructor(private readonly root: string) {}

  private safeProject(name: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._ -]*$/.test(name) || name.includes("..")) throw new StorageError("Invalid project name");
    const path = resolve(this.root, name);
    if (relative(this.root, path).startsWith("..")) throw new StorageError("Project is outside workspace");
    return path;
  }
  private async atomic(path: string, value: string) {
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, value, "utf8");
    await rename(temp, path);
  }
  private short(id: string, used: Set<string>) {
    const hash = createHash("sha256").update(id).digest("hex");
    for (let length = 4; length <= hash.length; length++) {
      const candidate = hash.slice(0, length);
      if (!used.has(candidate)) { used.add(candidate); return candidate; }
    }
    throw new StorageError("Unable to generate unique short identifier");
  }
  async listProjects() {
    await mkdir(this.root, { recursive: true });
    const entries = await readdir(this.root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  }
  async createProject(name: string): Promise<Project> {
    const projectPath = this.safeProject(name);
    try { await stat(projectPath); throw new StorageError("A project with that name already exists"); } catch (error) {
      if (error instanceof StorageError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await this.initializeProject(projectPath, name);
    return this.openProject(name);
  }
  private async initializeProject(projectPath: string, name: string) {
    const id = randomUUID();
    await mkdir(join(projectPath, "nodes"), { recursive: true });
    await mkdir(join(projectPath, "claims"), { recursive: true });
    await mkdir(join(projectPath, "assets"), { recursive: true });
    await this.atomic(join(projectPath, "specification.json"), JSON.stringify({ formatVersion: 1, rootNodeId: id }, null, 2));
    await this.writeNode(projectPath, { id, name, parentId: null });
  }
  async ensureProject(name: string): Promise<Project> {
    const projectPath = this.safeProject(name);
    try {
      const entries = await readdir(projectPath);
      if (entries.length === 0) await this.initializeProject(projectPath, name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.initializeProject(projectPath, name);
    }
    return this.openProject(name);
  }
  private async readManifest(path: string): Promise<Manifest> {
    try {
      const manifest = JSON.parse(await readFile(join(path, "specification.json"), "utf8")) as Manifest;
      if (manifest.formatVersion !== 1 || !manifest.rootNodeId) throw new Error();
      return manifest;
    } catch { throw new StorageError("Project has an invalid specification.json"); }
  }
  private async writeNode(projectPath: string, node: NodeMeta) {
    await this.atomic(join(projectPath, "nodes", `${node.id}.json`), JSON.stringify(node, null, 2));
    const contentPath = join(projectPath, "nodes", `${node.id}.md`);
    try { await stat(contentPath); } catch { await this.atomic(contentPath, ""); }
  }
  private claimFile(claim: Pick<StoredClaim, "id" | "nodeId" | "text" | "order"> & { verification?: VerificationStatus }) {
    return `---\nid: ${claim.id}\nnodeId: ${claim.nodeId}\norder: ${claim.order}\nverification: ${claim.verification ?? "unverified"}\n---\n${claim.text.trim()}\n`;
  }
  private async load(projectPath: string) {
    const manifest = await this.readManifest(projectPath);
    const used = new Set<string>();
    const nodeFiles = (await readdir(join(projectPath, "nodes"))).filter((file) => file.endsWith(".json"));
    const nodes = new Map<string, NodeMeta>();
    for (const file of nodeFiles) {
      try {
        const node = JSON.parse(await readFile(join(projectPath, "nodes", file), "utf8")) as NodeMeta;
        if (!node.id || !node.name || !file.startsWith(node.id)) throw new Error();
        nodes.set(node.id, node);
      } catch { throw new StorageError(`Invalid node file: ${file}`); }
    }
    if (!nodes.has(manifest.rootNodeId)) throw new StorageError("Root node is missing");
    const claims: StoredClaim[] = [];
    for (const file of (await readdir(join(projectPath, "claims"))).filter((entry) => entry.endsWith(".md"))) {
      const raw = await readFile(join(projectPath, "claims", file), "utf8");
      const match = raw.match(/^---\nid: ([^\n]+)\nnodeId: ([^\n]+)\n(?:order: (\d+)\n)?(?:verification: (unverified|verified|failed)\n)?---\n([\s\S]*)$/);
      if (!match || !nodes.has(match[2])) throw new StorageError(`Invalid claim file: ${file}`);
      claims.push({ id: match[1], nodeId: match[2], order: Number(match[3] ?? Number.MAX_SAFE_INTEGER), verification: (match[4] ?? "unverified") as VerificationStatus, text: match[5].trim(), shortId: "" });
    }
    const nodeShortIds = new Map([...nodes.keys()].map((id) => [id, this.short(id, used)]));
    claims.forEach((claim) => { claim.shortId = this.short(claim.id, used); });
    return { manifest, nodes, claims, nodeShortIds };
  }
  async openProject(name: string): Promise<Project> {
    const path = this.safeProject(name);
    const { manifest, nodes, claims, nodeShortIds } = await this.load(path);
    const children = new Map<string, NodeMeta[]>();
    for (const node of nodes.values()) {
      if (node.parentId && !nodes.has(node.parentId)) throw new StorageError(`Node ${node.name} has a missing parent`);
      if (node.parentId) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
    }
    const build = async (node: NodeMeta, trail = new Set<string>()): Promise<NodeRecord> => {
      if (trail.has(node.id)) throw new StorageError("Hierarchy contains a cycle");
      const nextTrail = new Set(trail).add(node.id);
      const nodeClaims = claims.filter((claim) => claim.nodeId === node.id).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      const nested = await Promise.all((children.get(node.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)).map((child) => build(child, nextTrail)));
      const directClaimCount = nodeClaims.length;
      const verifiedClaimCount = nodeClaims.filter((claim) => claim.verification === "verified").length + nested.reduce((sum, child) => sum + child.verifiedClaimCount, 0);
      const verification: VerificationStatus = nodeClaims.some((claim) => claim.verification === "failed") || nested.some((child) => child.verification === "failed") ? "failed" : nodeClaims.every((claim) => claim.verification === "verified") && nested.every((child) => child.verification === "verified") ? "verified" : "unverified";
      return { id: node.id, shortId: nodeShortIds.get(node.id)!, name: node.name, parentId: node.parentId,
        content: await readFile(join(path, "nodes", `${node.id}.md`), "utf8"), claims: nodeClaims, children: nested,
        directClaimCount, recursiveClaimCount: directClaimCount + nested.reduce((sum, child) => sum + child.recursiveClaimCount, 0), verifiedClaimCount, verification };
    };
    let testResults: TestResultsFile[] = [];
    try { testResults = (await readdir(join(path, "test-results"))).flatMap((file) => { const match = file.match(/^([0-9a-f-]{36})__(.+)$/); return match ? [{ id: match[1], fileName: match[2] }] : []; }); } catch { /* optional legacy directory */ }
    return { id: basename(path), name: basename(path), rootNodeId: manifest.rootNodeId, tree: await build(nodes.get(manifest.rootNodeId)!), testResults };
  }
  async createNode(project: string, parentId: string, name: string) {
    const path = this.safeProject(project); const loaded = await this.load(path);
    if (!loaded.nodes.has(parentId)) throw new StorageError("Parent node was not found");
    if (!name.trim()) throw new StorageError("Node name is required");
    const node = { id: randomUUID(), name: name.trim(), parentId };
    await this.writeNode(path, node); return this.openProject(project);
  }
  async updateNode(project: string, id: string, changes: { name?: string; content?: string }) {
    const path = this.safeProject(project); const loaded = await this.load(path); const node = loaded.nodes.get(id);
    if (!node) throw new StorageError("Node was not found");
    if (changes.name !== undefined) { if (!changes.name.trim()) throw new StorageError("Node name is required"); await this.writeNode(path, { ...node, name: changes.name.trim() }); }
    if (changes.content !== undefined) await this.atomic(join(path, "nodes", `${id}.md`), changes.content);
    return this.openProject(project);
  }
  async moveNode(project: string, id: string, parentId: string) {
    const path = this.safeProject(project); const loaded = await this.load(path); const node = loaded.nodes.get(id);
    if (!node || !loaded.nodes.has(parentId)) throw new StorageError("Node was not found");
    if (id === loaded.manifest.rootNodeId) throw new StorageError("The root node cannot be moved");
    let cursor: string | null = parentId; while (cursor) { if (cursor === id) throw new StorageError("A node cannot be moved into its own descendant"); cursor = loaded.nodes.get(cursor)?.parentId ?? null; }
    await this.writeNode(path, { ...node, parentId }); return this.openProject(project);
  }
  async createClaim(project: string, nodeId: string, text: string) {
    const path = this.safeProject(project); const loaded = await this.load(path);
    if (!loaded.nodes.has(nodeId)) throw new StorageError("Node was not found"); if (!text.trim()) throw new StorageError("Claim text is required");
    const id = randomUUID(); const order = Math.max(-1, ...loaded.claims.filter((claim) => claim.nodeId === nodeId).map((claim) => claim.order)) + 1;
    await this.atomic(join(path, "claims", `${id}.md`), this.claimFile({ id, nodeId, order, text })); return this.openProject(project);
  }
  async updateClaim(project: string, id: string, text: string) {
    const path = this.safeProject(project); const claim = (await this.load(path)).claims.find((item) => item.id === id);
    if (!claim) throw new StorageError("Claim was not found"); if (!text.trim()) throw new StorageError("Claim text is required");
    await this.atomic(join(path, "claims", `${id}.md`), this.claimFile({ ...claim, text })); return this.openProject(project);
  }
  async reorderClaims(project: string, nodeId: string, orderedIds: string[]) {
    const path = this.safeProject(project); const loaded = await this.load(path);
    const claims = loaded.claims.filter((claim) => claim.nodeId === nodeId);
    if (claims.length !== orderedIds.length || new Set(orderedIds).size !== orderedIds.length || !orderedIds.every((id) => claims.some((claim) => claim.id === id))) throw new StorageError("Claim order does not match this node");
    await Promise.all(orderedIds.map((id, order) => {
      const claim = claims.find((item) => item.id === id)!;
      return this.atomic(join(path, "claims", `${id}.md`), this.claimFile({ ...claim, order }));
    }));
    return this.openProject(project);
  }
  async deleteClaim(project: string, id: string) {
    const path = this.safeProject(project); const file = join(path, "claims", `${id}.md`);
    try { await unlink(file); } catch { throw new StorageError("Claim was not found"); }
    return this.openProject(project);
  }
  async saveAsset(project: string, nodeId: string, file: Express.Multer.File) {
    const path = this.safeProject(project); if (!(await this.load(path)).nodes.has(nodeId)) throw new StorageError("Node was not found");
    if (!file.mimetype.startsWith("image/")) throw new StorageError("Only image uploads are supported");
    const extension = extname(file.originalname).replace(/[^.a-zA-Z0-9]/g, "") || ".img"; const id = randomUUID();
    await writeFile(join(path, "assets", `${id}${extension}`), file.buffer); return `../assets/${id}${extension}`;
  }
  /** Legacy persistence helper; test-result uploads are intentionally not routed by the application. */
  async saveTestResults(project: string, nodeId: string, file: { buffer: Buffer; mimetype: string; originalname: string }) {
    const path = this.safeProject(project); const manifest = await this.readManifest(path);
    if (nodeId !== manifest.rootNodeId) throw new StorageError("Test results can only be attached to the top-level node");
    await mkdir(join(path, "test-results"), { recursive: true }); const id = randomUUID(); const name = basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_");
    await this.atomic(join(path, "test-results", `${id}__${name}`), file.buffer.toString("utf8")); return this.openProject(project);
  }
  async deleteTestResults(project: string, nodeId: string, id: string) {
    const path = this.safeProject(project); const files = await readdir(join(path, "test-results")); const file = files.find((entry) => entry.startsWith(`${id}__`));
    if (nodeId !== (await this.readManifest(path)).rootNodeId || !file) throw new StorageError("Test results file was not found"); await unlink(join(path, "test-results", file)); return this.openProject(project);
  }
  async verify(project: string, resultsPath = join(this.safeProject(project), "test-results")) {
    const path = this.safeProject(project); const loaded = await this.load(path); const files: string[] = [];
    const collect = async (candidate: string) => { let info; try { info = await stat(candidate); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; } if (info.isFile()) files.push(candidate); else if (info.isDirectory()) for (const entry of await readdir(candidate, { withFileTypes: true })) await collect(join(candidate, entry.name)); };
    await collect(resolve(resultsPath));
    const assertions: { name: string; status: string }[] = [];
    try {
      for (const file of files) {
        if (!/\.(?:json|jsonl|ndjson|xml|junit|trx|tap|txt|log)$/i.test(file)) continue;
        const raw = await readFile(file, "utf8");
        if (/\.trx$/i.test(file)) { assertions.push(...parseTrxAssertions(raw)); continue; }
        if (/\.tap$/i.test(file)) { assertions.push(...parseTapAssertions(raw)); continue; }
        if (/\.(?:txt|log)$/i.test(file)) { assertions.push(...parseCargoAssertions(raw)); continue; }
        if (/\.(?:xml|junit)$/i.test(file)) { assertions.push(...parseXunitAssertions(raw)); continue; }
        let report: { testResults?: { assertionResults?: { fullName?: string; title?: string; status?: string }[] }[] };
        try { report = JSON.parse(raw); } catch {
          const goAssertions = parseGoTestAssertions(raw);
          if (goAssertions.length > 0) { assertions.push(...goAssertions); continue; }
          throw new StorageError(`Test results file ${file} is not valid JSON`);
        }
        report.testResults?.forEach((suite) => suite.assertionResults?.forEach((assertion) => assertions.push({ name: assertion.fullName ?? assertion.title ?? "", status: assertion.status ?? "" })));
      }
    } catch (error) { if (error instanceof StorageError) throw error; if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await Promise.all(loaded.claims.map((claim) => {
      const matches = assertions.filter((assertion) => assertion.name.includes(claim.shortId));
      const verification: VerificationStatus = matches.some((assertion) => assertion.status === "failed") ? "failed" : matches.some((assertion) => assertion.status === "passed") ? "verified" : "unverified";
      return this.atomic(join(path, "claims", `${claim.id}.md`), this.claimFile({ ...claim, verification }));
    }));
    return this.openProject(project);
  }
}
