import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import type { VerificationTestFile } from "../shared/types.ts";

type TestAssertion = { name: string; status: string };

export class TestResultsError extends Error {
  status = 400;
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseXunitAssertions(xml: string): TestAssertion[] {
  const assertions: TestAssertion[] = [];
  for (const match of xml.matchAll(
    /<(testcase|test-case|test)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:testcase|test-case|test)>)/gi,
  )) {
    const nameMatch = match[2].match(/\bname\s*=\s*(["'])(.*?)\1/i);
    if (!nameMatch) continue;
    const body = match[3] ?? "";
    const result = match[2].match(/\b(?:result|status)\s*=\s*(["'])(.*?)\1/i)?.[2].toLowerCase();
    assertions.push({
      name: decodeXml(nameMatch[2]),
      status:
        /<(?:failure|error)\b/i.test(body) || ["fail", "failed", "error"].includes(result ?? "")
          ? "failed"
          : /<skipped\b/i.test(body) || ["skip", "skipped", "notrun"].includes(result ?? "")
            ? "skipped"
            : "passed",
    });
  }
  return assertions;
}

function parseTrxAssertions(xml: string): TestAssertion[] {
  const assertions: TestAssertion[] = [];
  for (const match of xml.matchAll(
    /<UnitTestResult\b([^>]*?)(?:\/>|>([\s\S]*?)<\/UnitTestResult>)/gi,
  )) {
    const nameMatch = match[1].match(/\btestName\s*=\s*(["'])(.*?)\1/i);
    if (!nameMatch) continue;
    const outcome = match[1].match(/\boutcome\s*=\s*(["'])(.*?)\1/i)?.[2].toLowerCase();
    assertions.push({
      name: decodeXml(nameMatch[2]),
      status:
        outcome === "passed"
          ? "passed"
          : ["failed", "error", "timeout", "aborted"].includes(outcome ?? "")
            ? "failed"
            : "skipped",
    });
  }
  return assertions;
}

function parseTapAssertions(tap: string): TestAssertion[] {
  return tap.split(/\r?\n/).flatMap((line) => {
    const match = line.trim().match(/^(not ok|ok)\b(?:\s+\d+)?(?:\s*-\s*)?(.*)$/i);
    if (!match) return [];
    return [
      {
        name: match[2].replace(/\s+#\s*(?:skip|todo)\b.*$/i, "").trim(),
        status: /#\s*(?:skip|todo)\b/i.test(match[2])
          ? "skipped"
          : match[1].toLowerCase() === "ok"
            ? "passed"
            : "failed",
      },
    ];
  });
}

function parseCargoAssertions(output: string): TestAssertion[] {
  const clean = output.replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, "");
  return [...clean.matchAll(/^\s*test\s+(.+?)\s+\.\.\.\s+(ok|FAILED|ignored)\s*$/gim)].map(
    (match) => ({
      name: match[1].trim(),
      status:
        match[2].toLowerCase() === "ok"
          ? "passed"
          : match[2].toLowerCase() === "failed"
            ? "failed"
            : "skipped",
    }),
  );
}

function parseGoTestAssertions(output: string): TestAssertion[] {
  const assertions: TestAssertion[] = [];
  for (const line of output.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line) as { Action?: string; Test?: string };
      const action = event.Action?.toLowerCase();
      if (event.Test && action && ["pass", "fail", "skip"].includes(action))
        assertions.push({
          name: event.Test,
          status: action === "pass" ? "passed" : action === "fail" ? "failed" : "skipped",
        });
    } catch {
      /* Ignore non-event lines in JSON-lines output. */
    }
  }
  return assertions;
}

function parseTestAssertions(file: string, raw: string): TestAssertion[] {
  if (/\.trx$/i.test(file)) return parseTrxAssertions(raw);
  if (/\.tap$/i.test(file)) return parseTapAssertions(raw);
  if (/\.(?:txt|log)$/i.test(file)) return parseCargoAssertions(raw);
  if (/\.(?:xml|junit)$/i.test(file)) return parseXunitAssertions(raw);
  try {
    const report = JSON.parse(raw) as {
      testResults?: {
        assertionResults?: { fullName?: string; title?: string; status?: string }[];
      }[];
    };
    return (
      report.testResults?.flatMap(
        (suite) =>
          suite.assertionResults?.map((assertion) => ({
            name: assertion.fullName ?? assertion.title ?? "",
            status: assertion.status ?? "",
          })) ?? [],
      ) ?? []
    );
  } catch {
    const assertions = parseGoTestAssertions(raw);
    if (assertions.length) return assertions;
    throw new TestResultsError(`Test results file ${file} is not valid JSON`);
  }
}

async function collectTestResultFiles(candidate: string, files: string[] = []): Promise<string[]> {
  let info;
  try {
    info = await stat(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return files;
    throw error;
  }
  if (info.isFile()) files.push(candidate);
  else if (info.isDirectory())
    for (const entry of await readdir(candidate, { withFileTypes: true }))
      await collectTestResultFiles(join(candidate, entry.name), files);
  return files;
}

const supportedTestResult = /\.(?:json|jsonl|ndjson|xml|junit|trx|tap|txt|log)$/i;

export async function verificationTests(resultsPath: string): Promise<VerificationTestFile[]> {
  const root = resolve(resultsPath);
  const files = (await collectTestResultFiles(root))
    .filter((file) => supportedTestResult.test(file))
    .sort();
  return Promise.all(
    files.map(async (file) => {
      const info = await stat(file);
      return {
        fileName: relative(root, file) || basename(file),
        modifiedAt: info.mtime.toISOString(),
        tests: parseTestAssertions(file, await readFile(file, "utf8")).map((test) => ({
          name: test.name,
          status:
            test.status === "failed"
              ? ("failed" as const)
              : test.status === "passed"
                ? ("passed" as const)
                : ("ignored" as const),
        })),
      };
    }),
  );
}
