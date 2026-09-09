import { useEffect, useRef, useState } from "react";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ReactMarkdown from "react-markdown";
import type { NodeRecord, Project, VerificationTest } from "../shared/types.ts";
import { api } from "./api.ts";

export function SubsystemDetail({
  project,
  node,
  tests,
  refresh,
  setError,
  onSelect,
}: {
  project: Project;
  node: NodeRecord;
  tests: VerificationTest[];
  refresh: (p: Project) => void;
  setError: (e: string) => void;
  onSelect: (id: string) => void;
}) {
  const [name, setName] = useState(node.name);
  const [content, setContent] = useState(node.content);
  const [claim, setClaim] = useState("");
  const [editingContent, setEditingContent] = useState(!node.content);
  const newClaimInput = useRef<HTMLTextAreaElement>(null);
  const doneEditingButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setName(node.name);
    setContent(node.content);
    setClaim("");
    setEditingContent(!node.content);
  }, [node]);
  const save = async (changes: object) => {
    try {
      refresh(await api.updateNode(project.name, node.id, changes));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const addClaim = async () => {
    try {
      refresh(await api.createClaim(project.name, node.id, claim));
      setClaim("");
      newClaimInput.current?.focus();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    try {
      const ref = await api.upload(project.name, node.id, file);
      const next = `${content}${content ? "\n\n" : ""}![${file.name}](${ref})`;
      setContent(next);
      refresh(await api.updateNode(project.name, node.id, { content: next }));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <main className="detail">
      <header>
        <div>
          <input
            className="node-title"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== node.name && save({ name })}
          />
          <p className="hint">Status: {node.verification}</p>
        </div>
        <div className="node-actions">
          <button
            onClick={async () => {
              const child = prompt("Name for the new sub-system node");
              if (child)
                try {
                  refresh(await api.createNode(project.name, node.id, child));
                } catch (e) {
                  setError((e as Error).message);
                }
            }}
          >
            Add child
          </button>
          {node.parentId && (
            <button
              className="danger"
              onClick={async () => {
                const claimsWarning = node.directClaimCount
                  ? ` Its ${node.directClaimCount} ${node.directClaimCount === 1 ? "claim" : "claims"} will be moved to the parent node.`
                  : "";
                if (!confirm(`Delete ${node.name}?${claimsWarning}`)) return;
                try {
                  const parentId = node.parentId!;
                  refresh(await api.deleteNode(project.name, node.id));
                  onSelect(parentId);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Delete
            </button>
          )}
        </div>
      </header>
      <section>
        <h2>Claims</h2>
        <SortableContext
          items={node.claims.map((item) => `claim-${item.id}`)}
          strategy={verticalListSortingStrategy}
        >
          {node.claims.map((item) => (
            <ClaimEditor
              key={item.id}
              item={item}
              linkedTests={tests.filter((test) => test.name.includes(item.shortId))}
              project={project.name}
              refresh={refresh}
              setError={setError}
            />
          ))}
        </SortableContext>
        <div className="new-claim">
          <textarea
            ref={newClaimInput}
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && claim.trim()) {
                e.preventDefault();
                void addClaim();
              }
            }}
            placeholder="Add a verifiable claim…"
          />
          <button disabled={!claim.trim()} onClick={addClaim}>
            Add claim
          </button>
        </div>
      </section>
      <section>
        <h2>Description</h2>
        {editingContent ? (
          <div className="markdown node-content">
            {node.content && (
              <button
                className="icon-button edit-content"
                aria-label="Done editing"
                ref={doneEditingButton}
                title="Done editing"
                onClick={async () => {
                  if (content !== node.content) await save({ content });
                  setEditingContent(false);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m5 12 4 4L19 6" />
                </svg>
              </button>
            )}
            <div className="node-content-body">
              <textarea
                className="content-editor"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onPaste={async (event) => {
                  const images = Array.from(event.clipboardData.items)
                    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
                    .map((item) => item.getAsFile())
                    .filter((file): file is File => file !== null);
                  if (!images.length) return;
                  event.preventDefault();
                  const editor = event.currentTarget;
                  const { selectionStart, selectionEnd } = editor;
                  try {
                    const markdown = (
                      await Promise.all(
                        images.map(async (file) => {
                          const ref = await api.upload(project.name, node.id, file);
                          return `![${file.name.replace(/[\\\[\]]/g, "\\$&")}](${ref})`;
                        }),
                      )
                    ).join("\n\n");
                    if (!editor.isConnected) return;
                    setContent(
                      (current) =>
                        current.slice(0, selectionStart) + markdown + current.slice(selectionEnd),
                    );
                  } catch (error) {
                    setError((error as Error).message);
                  }
                }}
                onBlur={(event) => {
                  // The check button saves on click; a blur save can replace it before that click.
                  if (
                    doneEditingButton.current &&
                    event.relatedTarget === doneEditingButton.current
                  )
                    return;
                  if (content !== node.content) void save({ content });
                }}
              />
              <div>
                <label className="upload">
                  Upload image{" "}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => upload(e.target.files?.[0])}
                  />
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div className="markdown node-content">
            <button
              className="icon-button edit-content"
              aria-label="Edit content"
              title="Edit content"
              onClick={() => setEditingContent(true)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m16 3 5 5M3 21l5-1L21 7a2.1 2.1 0 0 0-5-5L3 15z" />
              </svg>
            </button>
            <div className="node-content-body">
              <ReactMarkdown>
                {content.replaceAll(
                  "../assets/",
                  `/projects/${encodeURIComponent(project.name)}/assets/`,
                )}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </section>
      <section>
        <h2>Direct children</h2>
        {node.children.length ? (
          <ul className="children">
            {node.children.map((child) => (
              <li key={child.id}>
                <button className="child-link" onClick={() => onSelect(child.id)}>
                  {child.name}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">No direct children.</p>
        )}
      </section>
    </main>
  );
}
function ClaimEditor({
  item,
  linkedTests,
  project,
  refresh,
  setError,
}: {
  item: NodeRecord["claims"][number];
  linkedTests: VerificationTest[];
  project: string;
  refresh: (p: Project) => void;
  setError: (e: string) => void;
}) {
  const [text, setText] = useState(item.text);
  const [copied, setCopied] = useState(false);
  useEffect(() => setText(item.text), [item]);
  const sortable = useSortable({ id: `claim-${item.id}` });
  const statusStyle = item.ignored
    ? { borderLeft: "4px solid var(--muted)", background: "var(--surface-hover)" }
    : item.verification === "verified"
      ? { borderLeft: "4px solid var(--green)", background: "var(--green-bg)" }
      : item.verification === "failed"
        ? { borderLeft: "4px solid var(--red)", background: "var(--red-bg)" }
        : { borderLeft: "4px solid var(--amber)", background: "var(--amber-bg)" };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.shortId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      setError((e as Error).message || "Could not copy identifier");
    }
  };
  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        ...statusStyle,
        gridTemplateColumns: "minmax(10rem, max-content) minmax(0, 1fr) auto",
        alignItems: "start",
      }}
      className="claim"
    >
      <code
        style={{
          display: "flex",
          alignItems: "center",
          gap: ".25rem",
          whiteSpace: "nowrap",
        }}
      >
        <button
          style={{ padding: ".15rem .3rem" }}
          className="drag-handle"
          ref={sortable.setActivatorNodeRef}
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label="Reorder claim"
        >
          ⠿
        </button>
        {item.shortId}{" "}
        <button
          style={{ padding: ".15rem .3rem" }}
          onClick={copy}
          title="Copy claim short identifier"
          aria-label="Copy claim short identifier"
        >
          {copied ? "✓" : "⧉"}
        </button>{" "}
        · {item.ignored ? "ignored" : item.verification}
      </code>
      <div className="claim-content">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={async () => {
            if (text !== item.text)
              try {
                refresh(await api.updateClaim(project, item.id, text));
              } catch (e) {
                setError((e as Error).message);
              }
          }}
        />
        {linkedTests.length > 0 && (
          <details className="linked-tests">
            <summary>
              {linkedTests.length} linked {linkedTests.length === 1 ? "test" : "tests"}
            </summary>
            <ul>
              {linkedTests.map((test, index) => (
                <li key={`${test.name}-${index}`}>
                  <span>{test.name}</span>
                  <strong className={`test-status ${test.status}`}>{test.status}</strong>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <div className="claim-actions">
        <button
          onClick={async () => {
            try {
              refresh(await api.setClaimIgnored(project, item.id, !item.ignored));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {item.ignored ? "Include" : "Ignore"}
        </button>
        <button
          className="danger icon-button"
          aria-label="Delete claim"
          title="Delete claim"
          onClick={async () => {
            if (confirm("Delete this claim?"))
              try {
                refresh(await api.deleteClaim(project, item.id));
              } catch (e) {
                setError((e as Error).message);
              }
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
