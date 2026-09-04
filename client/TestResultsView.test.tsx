import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { VerificationTestFile } from "../shared/types.ts";
import { TestResultsView } from "./TestResultsView.tsx";

const files: VerificationTestFile[] = [
  {
    fileName: "unit.json",
    modifiedAt: "2026-09-04T01:02:03.000Z",
    tests: [
      { name: "passes", status: "passed" },
      { name: "fails", status: "failed" },
    ],
  },
  {
    fileName: "integration.tap",
    modifiedAt: "2026-09-04T04:05:06.000Z",
    tests: [{ name: "skipped", status: "ignored" }],
  },
];

describe("TestResultsView", () => {
  it("8b55 renders a read-only view of tests used for verification", () => {
    const html = renderToStaticMarkup(<TestResultsView files={files} />);
    expect(html).toContain("passes");
    expect(html).not.toMatch(/<(?:input|button|textarea)\b/);
  });
  it("73ad groups tests by file", () => {
    const html = renderToStaticMarkup(<TestResultsView files={files} />);
    expect(html).toContain("unit.json");
    expect(html).toContain("integration.tap");
    expect(html.match(/test-result-file/g)).toHaveLength(3);
  });
  it("842d highlights passed, failed and ignored tests", () => {
    const html = renderToStaticMarkup(<TestResultsView files={files} />);
    expect(html).toContain("test-result passed");
    expect(html).toContain("test-result failed");
    expect(html).toContain("test-result ignored");
  });
  it("8575 shows the modified time of each test file", () => {
    const html = renderToStaticMarkup(<TestResultsView files={files} />);
    expect(html.match(/<time /g)).toHaveLength(2);
    expect(html).toContain('dateTime="2026-09-04T01:02:03.000Z"');
  });
});
