import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectStorage, StorageError } from "./storage.ts";

const roots: string[] = [];
async function fixture() { const root = await mkdtemp(join(tmpdir(), "spec-tool-")); roots.push(root); return new ProjectStorage(root); }
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
describe("ProjectStorage", () => {
  it("persists a hierarchy, claims and recursive counts 45b1", async () => {
    const store = await fixture(); let project = await store.createProject("payment-system");
    project = await store.createNode(project.name, project.rootNodeId, "Gateway"); const gateway = project.tree.children[0];
    project = await store.createClaim(project.name, gateway.id, "The gateway validates messages.");
    project = await store.createNode(project.name, gateway.id, "Parser");
    project = await store.createClaim(project.name, project.tree.children[0].children[0].id, "The parser rejects malformed input.");
    const loaded = await store.openProject("payment-system"); expect(loaded.tree.recursiveClaimCount).toBe(2); expect(loaded.tree.children[0].directClaimCount).toBe(1); expect(loaded.tree.children[0].shortId).toHaveLength(4);
  });
  it("prevents moving the root or a node into a descendant", async () => {
    const store = await fixture(); let project = await store.createProject("system"); project = await store.createNode("system", project.rootNodeId, "Child");
    const child = project.tree.children[0]; await expect(store.moveNode("system", project.rootNodeId, child.id)).rejects.toBeInstanceOf(StorageError);
    await expect(store.moveNode("system", child.id, child.id)).rejects.toBeInstanceOf(StorageError);
  });
  it("does not overwrite an existing project", async () => {
    const store = await fixture(); await store.createProject("system");
    await expect(store.createProject("system")).rejects.toBeInstanceOf(StorageError);
  });
  it("initializes an existing empty directory as a project", async () => {
    const storeRoot = await mkdtemp(join(tmpdir(), "spec-tool-")); roots.push(storeRoot); const root = storeRoot;
    const emptyPath = join(root, "empty-project");
    const { mkdir } = await import("node:fs/promises"); await mkdir(emptyPath);
    const store = new ProjectStorage(root); const project = await store.ensureProject("empty-project");
    expect(project.tree.name).toBe("empty-project");
  });
  it("persists claim ordering within a node", async () => {
    const store = await fixture(); let project = await store.createProject("system");
    project = await store.createClaim("system", project.rootNodeId, "First");
    project = await store.createClaim("system", project.rootNodeId, "Second");
    const [first, second] = project.tree.claims;
    await store.reorderClaims("system", project.rootNodeId, [second.id, first.id]);
    expect((await store.openProject("system")).tree.claims.map((claim) => claim.text)).toEqual(["Second", "First"]);
  });
  it("stores a valid test-results file only for the root node", async () => {
    const store = await fixture(); let project = await store.createProject("system");
    const file = { buffer: Buffer.from('{"success":true}'), mimetype: "application/json", originalname: "unit-results.json" };
    const withResults = await store.saveTestResults("system", project.rootNodeId, file);
    expect(withResults.testResults).toHaveLength(1);
    expect(await readFile(join(roots[0], "system", "test-results", `${withResults.testResults[0].id}__unit-results.json`), "utf8")).toBe('{"success":true}');
    project = await store.createNode("system", project.rootNodeId, "Child");
    await expect(store.saveTestResults("system", project.tree.children[0].id, file)).rejects.toBeInstanceOf(StorageError);
  });
  it("keeps multiple test-results files and deletes one by ID", async () => {
    const store = await fixture(); const project = await store.createProject("system");
    const one = await store.saveTestResults("system", project.rootNodeId, { buffer: Buffer.from("{}"), mimetype: "application/json", originalname: "one.json" });
    const two = await store.saveTestResults("system", project.rootNodeId, { buffer: Buffer.from("{}"), mimetype: "application/json", originalname: "two.json" });
    expect(two.testResults).toHaveLength(2);
    const remaining = await store.deleteTestResults("system", project.rootNodeId, one.testResults[0].id);
    expect(remaining.testResults.map((file) => file.fileName)).toEqual(["two.json"]);
  });
  it("verifies matching claims and gives failing tests precedence", async () => {
    const store = await fixture(); let project = await store.createProject("system");
    project = await store.createClaim("system", project.rootNodeId, "The service responds.");
    const claim = project.tree.claims[0];
    const report = { testResults: [{ assertionResults: [
      { fullName: `response test ${claim.shortId}`, status: "passed" },
      { fullName: `regression ${claim.shortId}`, status: "failed" }
    ] }] };
    await store.saveTestResults("system", project.rootNodeId, { buffer: Buffer.from(JSON.stringify(report)), mimetype: "application/json", originalname: "report.json" });
    const verified = await store.verify("system");
    expect(verified.tree.claims[0].verification).toBe("failed");
    expect(verified.tree.verification).toBe("failed");
  });
  it("marks a node verified when all of its claims have passing matches", async () => {
    const store = await fixture(); let project = await store.createProject("system");
    project = await store.createClaim("system", project.rootNodeId, "The service responds.");
    const claim = project.tree.claims[0];
    const report = { testResults: [{ assertionResults: [{ fullName: `response test ${claim.shortId}`, status: "passed" }] }] };
    await store.saveTestResults("system", project.rootNodeId, { buffer: Buffer.from(JSON.stringify(report)), mimetype: "application/json", originalname: "report.json" });
    const verified = await store.verify("system");
    expect(verified.tree.claims[0].verification).toBe("verified");
    expect(verified.tree.verification).toBe("verified");
  });
  it("verifies claims from XUnit XML testcase names", async () => {
    const store = await fixture(); let project = await store.createProject("system");
    project = await store.createClaim("system", project.rootNodeId, "The XML-tested service works.");
    const claim = project.tree.claims[0];
    const xml = `<testsuites><testsuite name="unit"><testcase name="service ${claim.shortId} passes"/><testcase name="service ${claim.shortId} failure"><failure message="broken"/></testcase></testsuite>`;
    await store.saveTestResults("system", project.rootNodeId, { buffer: Buffer.from(xml), mimetype: "application/xml", originalname: "xunit_test_result.xml" });
    const verified = await store.verify("system");
    expect(verified.tree.claims[0].verification).toBe("failed");
  });
  it("accepts XUnit test elements with result attributes", async () => {
    const store = await fixture(); let project = await store.createProject("system");
    project = await store.createClaim("system", project.rootNodeId, "The test runner works.");
    const claim = project.tree.claims[0];
    const xml = `<assemblies><assembly><collection><test name="runner ${claim.shortId}" result="Pass"/><test name="runner ${claim.shortId} failure" result="Fail"/></collection></assembly></assemblies>`;
    await store.saveTestResults("system", project.rootNodeId, { buffer: Buffer.from(xml), mimetype: "text/xml", originalname: "xunit_test_result.xml" });
    expect((await store.verify("system")).tree.claims[0].verification).toBe("failed");
  });
  it("verifies claims from MSTest TRX UnitTestResult entries", async () => {
    const store = await fixture(); let project = await store.createProject("system");
    project = await store.createClaim("system", project.rootNodeId, "The MSTest service works.");
    const claim = project.tree.claims[0];
    const trx = `<TestRun><Results><UnitTestResult testName="service ${claim.shortId}" outcome="Passed"/><UnitTestResult testName="other ${claim.shortId}" outcome="Failed"/></Results></TestRun>`;
    await store.saveTestResults("system", project.rootNodeId, { buffer: Buffer.from(trx), mimetype: "application/xml", originalname: "xunit_test_result.trx" });
    expect((await store.verify("system")).tree.claims[0].verification).toBe("failed");
  });
  it("verifies claims from TAP ok and not ok lines", async () => {
    const store = await fixture(); let project = await store.createProject("system");
    project = await store.createClaim("system", project.rootNodeId, "The TAP service works.");
    const claim = project.tree.claims[0];
    const tap = `TAP version 13\n1..2\nok 1 - service ${claim.shortId}\nnot ok 2 - regression ${claim.shortId}\n`;
    await store.saveTestResults("system", project.rootNodeId, { buffer: Buffer.from(tap), mimetype: "text/plain", originalname: "test.tap" });
    expect((await store.verify("system")).tree.claims[0].verification).toBe("failed");
  });
  it("verifies claims from captured cargo test output", async () => {
    const store = await fixture(); let project = await store.createProject("system");
    project = await store.createClaim("system", project.rootNodeId, "The Rust service works.");
    const claim = project.tree.claims[0];
    const output = `running 1 test\ntest service::${claim.shortId} ... ok\ntest result: ok. 1 passed; 0 failed\n`;
    await store.saveTestResults("system", project.rootNodeId, { buffer: Buffer.from(output), mimetype: "text/plain", originalname: "cargo_test_result.txt" });
    expect((await store.verify("system")).tree.claims[0].verification).toBe("verified");
  });
  it("requires every sub-node to be verified before verifying its parent", async () => {
    const store = await fixture(); let project = await store.createProject("system");
    project = await store.createNode("system", project.rootNodeId, "Child");
    const child = project.tree.children[0];
    project = await store.createClaim("system", child.id, "The child works.");
    const claim = project.tree.children[0].claims[0];
    const report = { testResults: [{ assertionResults: [{ fullName: `child test ${claim.shortId}`, status: "passed" }] }] };
    await store.saveTestResults("system", project.rootNodeId, { buffer: Buffer.from(JSON.stringify(report)), mimetype: "application/json", originalname: "report.json" });
    expect((await store.verify("system")).tree.verification).toBe("verified");
    project = await store.createNode("system", project.rootNodeId, "Unverified child");
    project = await store.createClaim("system", project.tree.children.find((node) => node.name === "Unverified child")!.id, "The other child works.");
    expect(project.tree.verification).toBe("unverified");
  });
});
