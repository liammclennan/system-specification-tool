import { useEffect, useMemo, useRef, useState } from "react";
import { closestCenter, DndContext, pointerWithin, useDraggable, useDroppable } from "@dnd-kit/core";
import type { CollisionDetection, DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import ReactMarkdown from "react-markdown";
import type { NodeRecord, Project } from "../shared/types.ts";
import { api } from "./api.ts";

function findNode(node: NodeRecord, id: string): NodeRecord | undefined {
  return node.id === id
    ? node
    : node.children.map((child) => findNode(child, id)).find(Boolean);
}
function allNodeIds(node: NodeRecord): string[] {
  return [node.id, ...node.children.flatMap(allNodeIds)];
}
function countFailedClaims(node: NodeRecord): number {
  return (
    node.claims.filter((claim) => claim.verification === "failed").length +
    node.children.reduce((total, child) => total + countFailedClaims(child), 0)
  );
}
function countIgnoredClaims(node: NodeRecord): number {
  return (
    node.claims.filter((claim) => claim.ignored).length +
    node.children.reduce((total, child) => total + countIgnoredClaims(child), 0)
  );
}
const collisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length ? pointerCollisions : closestCenter(args);
};
const sidebarSizeKey = "system-specification-tool.sidebar-size";
function loadSidebarSize() {
  try {
    const size = Number(localStorage.getItem(sidebarSizeKey));
    return size >= 20 && size <= 60 ? size : 30;
  } catch {
    return 30;
  }
}
function saveSidebarSize(size: number) {
  try {
    localStorage.setItem(sidebarSizeKey, String(size));
  } catch {
    // Continue with the in-memory layout when storage is unavailable.
  }
}
function loadExpandedNodes(project: Project) {
  try {
    const stored = localStorage.getItem(`system-specification-tool.expanded.${project.name}`);
    if (stored === null) return new Set([project.rootNodeId]);
    const ids: unknown = JSON.parse(stored);
    if (!Array.isArray(ids)) return new Set([project.rootNodeId]);
    const validIds = new Set(allNodeIds(project.tree));
    return new Set(ids.filter((id): id is string => typeof id === "string" && validIds.has(id)));
  } catch {
    return new Set([project.rootNodeId]);
  }
}
function saveExpandedNodes(projectName: string, expanded: Set<string>) {
  try {
    localStorage.setItem(`system-specification-tool.expanded.${projectName}`, JSON.stringify([...expanded]));
  } catch {
    // Continue with the in-memory expansion state when storage is unavailable.
  }
}
function RenderedSpecification({ projectName }: { projectName: string }) {
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await api.verify(projectName);
        const response = await fetch(`/projects/${encodeURIComponent(projectName)}/specification.md`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load the generated specification.");
        const updatedMarkdown = await response.text();
        if (active) setMarkdown(updatedMarkdown);
      } catch (reason) {
        if (active) setError((reason as Error).message);
      }
    })();
    return () => { active = false; };
  }, [projectName]);
  return <main className="rendered-specification"><a href="/">← Back to application</a>{error ? <p className="error">{error}</p> : markdown ? <ReactMarkdown>{markdown.replaceAll("../assets/", `/projects/${encodeURIComponent(projectName)}/assets/`)}</ReactMarkdown> : <p>Verifying and generating specification…</p>}</main>;
}
function TreeNode({
  node,
  selected,
  onSelect,
  expanded,
  toggle,
}: {
  node: NodeRecord;
  selected: string;
  onSelect: (id: string) => void;
  expanded: Set<string>;
  toggle: (id: string) => void;
}) {
  const drag = useDraggable({ id: node.id });
  const drop = useDroppable({ id: node.id });
  const open = expanded.has(node.id);
  const failedClaimCount = node.failedClaimCount ?? countFailedClaims(node);
  const ignoredClaimCount = node.ignoredClaimCount ?? countIgnoredClaims(node);
  const includedClaimCount = node.recursiveClaimCount - ignoredClaimCount;
  const unverifiedClaimCount = Math.max(
    0,
    includedClaimCount - node.verifiedClaimCount - failedClaimCount,
  );
  const verifiedPercentage = includedClaimCount
    ? (node.verifiedClaimCount / includedClaimCount) * 100
    : 0;
  const failedPercentage = includedClaimCount
    ? (failedClaimCount / includedClaimCount) * 100
    : 0;
  return (
    <li>
      <div
        ref={drop.setNodeRef}
        className={`tree-row ${selected === node.id ? "selected" : ""} ${drop.isOver ? "drop-target" : ""}`}
        style={{ cursor: "pointer" }}
        onClick={() => onSelect(node.id)}
      >
        <button
          className="disclosure"
          onClick={(event) => {
            event.stopPropagation();
            toggle(node.id);
          }}
          aria-label={open ? "Collapse" : "Expand"}
        >
          {node.children.length ? (open ? "⌄" : "›") : "·"}
        </button>
        <span className="tree-name">{node.name}</span>
        <span className="count">
          {node.recursiveClaimCount} · {node.verification}
        </span>
        <span
          aria-label={`${node.verifiedClaimCount} verified, ${failedClaimCount} failed, ${unverifiedClaimCount} unverified, ${ignoredClaimCount} ignored claims`}
          title={`${node.verifiedClaimCount} verified · ${failedClaimCount} failed · ${unverifiedClaimCount} unverified · ${ignoredClaimCount} ignored`}
          style={{
            width: "1.1rem",
            height: "1.1rem",
            flex: "0 0 1.1rem",
            borderRadius: "50%",
            background: `conic-gradient(#20824a 0 ${verifiedPercentage}%, #c43d4b ${verifiedPercentage}% ${verifiedPercentage + failedPercentage}%, #d4dce7 ${verifiedPercentage + failedPercentage}% 100%)`,
          }}
        />
        <button
          ref={drag.setNodeRef}
          {...drag.listeners}
          {...drag.attributes}
          className="drag-handle"
          onClick={(event) => event.stopPropagation()}
          aria-label={`Move ${node.name}`}
        >
          ⠿
        </button>
      </div>
      {open && node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selected={selected}
              onSelect={onSelect}
              expanded={expanded}
              toggle={toggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
function Detail({
  project,
  node,
  refresh,
  setError,
  onSelect,
}: {
  project: Project;
  node: NodeRecord;
  refresh: (p: Project) => void;
  setError: (e: string) => void;
  onSelect: (id: string) => void;
}) {
  const [name, setName] = useState(node.name);
  const [content, setContent] = useState(node.content);
  const [claim, setClaim] = useState("");
  const [editingContent, setEditingContent] = useState(!node.content);
  const newClaimInput = useRef<HTMLTextAreaElement>(null);
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
            placeholder="Add a verifiable claim…"
          />
          <button disabled={!claim.trim()} onClick={addClaim}>
            Add claim
          </button>
        </div>
      </section>
      <section>
        <h2>Content</h2>
        {editingContent ? (
          <>
            <p className="hint">
              Markdown is saved directly in this node’s content file.
            </p>
            <textarea
              className="content-editor"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={() => content !== node.content && save({ content })}
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
              {node.content && (
                <button
                  onClick={async () => {
                    if (content !== node.content) await save({ content });
                    setEditingContent(false);
                  }}
                >
                  Done editing
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <button onClick={() => setEditingContent(true)}>
              Edit content
            </button>
            <div className="markdown">
              <ReactMarkdown>
                {content.replaceAll(
                  "../assets/",
                  `/projects/${encodeURIComponent(project.name)}/assets/`,
                )}
              </ReactMarkdown>
            </div>
          </>
        )}
      </section>
      <section>
        <h2>Direct children</h2>
        {node.children.length ? (
          <ul className="children">
            {node.children.map((child) => (
              <li key={child.id}>
                <button
                  className="child-link"
                  onClick={() => onSelect(child.id)}
                >
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
  project,
  refresh,
  setError,
}: {
  item: NodeRecord["claims"][number];
  project: string;
  refresh: (p: Project) => void;
  setError: (e: string) => void;
}) {
  const [text, setText] = useState(item.text);
  const [copied, setCopied] = useState(false);
  useEffect(() => setText(item.text), [item]);
  const sortable = useSortable({ id: `claim-${item.id}` });
  const statusStyle = item.ignored
    ? { borderLeft: "4px solid #788596", background: "#f1f3f6" }
    : item.verification === "verified"
      ? { borderLeft: "4px solid #20824a", background: "#effaf3" }
      : item.verification === "failed"
        ? { borderLeft: "4px solid #c43d4b", background: "#fff2f3" }
        : { borderLeft: "4px solid #c78813", background: "#fffaec" };
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
        {item.shortId} · {item.ignored ? "ignored" : item.verification}{" "}
        <button
          style={{ padding: ".15rem .3rem" }}
          onClick={copy}
          title="Copy claim short identifier"
          aria-label="Copy claim short identifier"
        >
          {copied ? "✓" : "⧉"}
        </button>
      </code>
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
      <div className="claim-actions">
        <button
          onClick={async () => {
            try {
              refresh(
                await api.setClaimIgnored(project, item.id, !item.ignored),
              );
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
function WorkspaceApp() {
  const [projects, setProjects] = useState<string[]>([]);
  const [project, setProject] = useState<Project>();
  const [selected, setSelected] = useState("");
  const [expanded, setExpanded] = useState(new Set<string>());
  const [error, setError] = useState("");
  const [sidebarSize] = useState(loadSidebarSize);
  const selectedNode = useMemo(
    () => project && findNode(project.tree, selected),
    [project, selected],
  );
  const refresh = (next: Project) => {
    if (project?.name !== next.name) setExpanded(loadExpandedNodes(next));
    setProject(next);
    setProjects((old) => (old.includes(next.name) ? old : [...old, next.name]));
  };
  useEffect(() => {
    void (async () => {
      try {
        const [availableProjects, configuration] = await Promise.all([
          api.projects(),
          api.configuration(),
        ]);
        setProjects(availableProjects);
        if (configuration.initialProject)
          await open(configuration.initialProject);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);
  useEffect(() => {
    if (project) {
      setSelected((id) => id || project.rootNodeId);
    }
  }, [project]);
  useEffect(() => {
    if (project) saveExpandedNodes(project.name, expanded);
  }, [project?.name, expanded]);
  const open = async (name: string) => {
    try {
      refresh(await api.project(name));
      setSelected("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const dragEnd = async (event: DragEndEvent) => {
    const id = String(event.active.id),
      overId = event.over && String(event.over.id);
    if (!project || !overId || id === overId) return;
    try {
      if (
        id.startsWith("claim-") &&
        overId.startsWith("claim-") &&
        selectedNode
      ) {
        const oldIndex = selectedNode.claims.findIndex(
          (claim) => `claim-${claim.id}` === id,
        );
        const newIndex = selectedNode.claims.findIndex(
          (claim) => `claim-${claim.id}` === overId,
        );
        if (oldIndex < 0 || newIndex < 0) return;
        const orderedIds = selectedNode.claims.map((claim) => claim.id);
        orderedIds.splice(newIndex, 0, orderedIds.splice(oldIndex, 1)[0]);
        refresh(
          await api.reorderClaims(project.name, selectedNode.id, orderedIds),
        );
        return;
      }
      if (id.startsWith("claim-") && !overId.startsWith("claim-")) {
        refresh(await api.moveClaim(project.name, id.slice("claim-".length), overId));
        setSelected(overId);
        setExpanded((old) => new Set(old).add(overId));
        return;
      }
      if (!id.startsWith("claim-") && !overId.startsWith("claim-")) {
        refresh(await api.moveNode(project.name, id, overId));
        setExpanded((old) => new Set(old).add(overId));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (!project)
    return (
      <div className="welcome">
        <h1>System Specification Tool</h1>
        <p>Open a specification stored in the configured server workspace.</p>
        {error && <p className="error">{error}</p>}
        <div className="project-actions">
          <select
            defaultValue=""
            onChange={(e) => e.target.value && open(e.target.value)}
          >
            <option value="" disabled>
              Choose a project…
            </option>
            {projects.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
          <button
            onClick={async () => {
              const name = prompt("New project name");
              if (name)
                try {
                  refresh(await api.createProject(name));
                } catch (e) {
                  setError((e as Error).message);
                }
            }}
          >
            Create project
          </button>
        </div>
      </div>
    );
  return (
    <div className="app">
      <DndContext collisionDetection={collisionDetection} onDragEnd={dragEnd}>
        <PanelGroup
          direction="horizontal"
          onLayout={(sizes) => saveSidebarSize(sizes[0])}
        >
          <Panel defaultSize={sidebarSize} minSize={20} className="sidebar">
            <div className="project-header">
              <strong>{project.name}</strong>
              <div className="project-header-actions">
                <a className="header-link icon-button" href={`/specification/${encodeURIComponent(project.name)}`} aria-label="View specification" title="View specification">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6zM14 3v5h5M9 13h6M9 17h6" /></svg>
                </a>
                <button
                  className="icon-button"
                  aria-label="Expand all"
                  title="Expand all"
                  onClick={() => setExpanded(new Set(allNodeIds(project.tree)))}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                </button>
                <button
                  className="icon-button"
                  aria-label="Verify"
                  title="Verify"
                  onClick={async () => {
                    try {
                      refresh(await api.verify(project.name));
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
                </button>
              </div>
            </div>
            <nav>
              <ul>
                <TreeNode
                  node={project.tree}
                  selected={selected}
                  onSelect={setSelected}
                  expanded={expanded}
                  toggle={(id) =>
                    setExpanded((old) => {
                      const next = new Set(old);
                      next.has(id) ? next.delete(id) : next.add(id);
                      return next;
                    })
                  }
                />
              </ul>
            </nav>
          </Panel>
          <PanelResizeHandle className="resize" />
          <Panel minSize={40}>
            {selectedNode && (
              <Detail
                key={selectedNode.id}
                project={project}
                node={selectedNode}
                refresh={refresh}
                setError={setError}
                onSelect={setSelected}
              />
            )}
          </Panel>
        </PanelGroup>
      </DndContext>
      {error && (
        <div className="toast" onClick={() => setError("")}>
          {error}
        </div>
      )}
    </div>
  );
}
export function App() {
  const match = window.location.pathname.match(/^\/specification\/([^/]+)\/?$/);
  if (match) {
    try { return <RenderedSpecification projectName={decodeURIComponent(match[1])} />; }
    catch { return <main className="rendered-specification"><a href="/">← Back to application</a><p className="error">The specification URL is invalid.</p></main>; }
  }
  return <WorkspaceApp />;
}
