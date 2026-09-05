import { useEffect, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { api } from "./api.ts";

interface TableOfContentsEntry {
  level: number;
  text: string;
  id: string;
  line: number;
}

function tableOfContents(markdown: string): TableOfContentsEntry[] {
  const used = new Map<string, number>();
  let fenced = false;
  return markdown.split("\n").flatMap((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return [];
    }
    if (fenced) return [];
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) return [];
    const text = match[2].replace(/[`*_~\[\]]/g, "").trim();
    const base =
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-|-$/g, "") || "section";
    const occurrence = used.get(base) ?? 0;
    used.set(base, occurrence + 1);
    return [{
      level: match[1].length,
      text,
      id: occurrence ? `${base}-${occurrence + 1}` : base,
      line: index + 1,
    }];
  });
}

export function RenderedSpecification({ projectName }: { projectName: string }) {
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const configuration = await api.configuration();
        if (configuration.verificationEnabled) await api.verify(projectName);
        const response = await fetch(
          `/projects/${encodeURIComponent(projectName)}/specification.md`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("Could not load the generated specification.");
        const updatedMarkdown = await response.text();
        if (active) setMarkdown(updatedMarkdown);
      } catch (reason) {
        if (active) setError((reason as Error).message);
      }
    })();
    return () => { active = false; };
  }, [projectName]);
  const contents = useMemo(() => tableOfContents(markdown), [markdown]);
  const headingIds = useMemo(
    () => new Map(contents.map((heading) => [heading.line, heading.id])),
    [contents],
  );
  const headingId = (node: { position?: { start: { line: number } } } | undefined) =>
    headingIds.get(node?.position?.start.line ?? -1);
  const components: Components = {
    h1: ({ node, ...props }) => <h1 id={headingId(node)} {...props} />,
    h2: ({ node, ...props }) => <h2 id={headingId(node)} {...props} />,
    h3: ({ node, ...props }) => <h3 id={headingId(node)} {...props} />,
    h4: ({ node, ...props }) => <h4 id={headingId(node)} {...props} />,
    h5: ({ node, ...props }) => <h5 id={headingId(node)} {...props} />,
    h6: ({ node, ...props }) => <h6 id={headingId(node)} {...props} />,
  };
  return (
    <main className="rendered-specification">
      <a href="/">← Back to application</a>
      {error ? (
        <p className="error">{error}</p>
      ) : markdown ? (
        <div className="rendered-specification-layout">
          <aside className="table-of-contents">
            <strong>Contents</strong>
            <nav aria-label="Table of contents">
              {contents.map((heading) => (
                <a key={`${heading.line}-${heading.id}`} href={`#${heading.id}`} style={{ paddingLeft: `${(heading.level - 1) * 0.75}rem` }}>
                  {heading.text}
                </a>
              ))}
            </nav>
          </aside>
          <article>
            <ReactMarkdown components={components}>
              {markdown.replaceAll("../assets/", `/projects/${encodeURIComponent(projectName)}/assets/`)}
            </ReactMarkdown>
          </article>
        </div>
      ) : (
        <p>Loading specification…</p>
      )}
    </main>
  );
}
