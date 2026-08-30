import { useEffect, useMemo, useState } from "react";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import ReactMarkdown from "react-markdown";
import type { NodeRecord, Project } from "../shared/types.ts";
import { api } from "./api.ts";

function findNode(node: NodeRecord, id: string): NodeRecord | undefined { return node.id === id ? node : node.children.map((child) => findNode(child, id)).find(Boolean); }
function TreeNode({ node, selected, onSelect, expanded, toggle }: { node: NodeRecord; selected: string; onSelect: (id: string) => void; expanded: Set<string>; toggle: (id: string) => void }) {
  const drag = useDraggable({ id: node.id }); const drop = useDroppable({ id: node.id }); const open = expanded.has(node.id);
  return <li ref={drop.setNodeRef} className={drop.isOver ? "drop-target" : ""}>
    <div className={`tree-row ${selected === node.id ? "selected" : ""}`} style={{ cursor: "pointer" }} onClick={() => onSelect(node.id)}>
      <button className="disclosure" onClick={(event) => { event.stopPropagation(); toggle(node.id); }} aria-label={open ? "Collapse" : "Expand"}>{node.children.length ? (open ? "⌄" : "›") : "·"}</button>
      <span className="tree-name">{node.name}</span><span className="count" title={`direct / including descendants; ${node.verification}`}>{node.directClaimCount}/{node.recursiveClaimCount} · {node.verification}</span>
      <button ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} className="drag-handle" onClick={(event) => event.stopPropagation()} aria-label={`Move ${node.name}`}>⠿</button>
    </div>
    {open && node.children.length > 0 && <ul>{node.children.map((child) => <TreeNode key={child.id} node={child} selected={selected} onSelect={onSelect} expanded={expanded} toggle={toggle} />)}</ul>}
  </li>;
}
function Detail({ project, node, refresh, setError, onSelect }: { project: Project; node: NodeRecord; refresh: (p: Project) => void; setError: (e: string) => void; onSelect: (id: string) => void }) {
  const [name, setName] = useState(node.name); const [content, setContent] = useState(node.content); const [claim, setClaim] = useState(""); const [editingContent, setEditingContent] = useState(!node.content);
  useEffect(() => { setName(node.name); setContent(node.content); setClaim(""); setEditingContent(!node.content); }, [node]);
  const save = async (changes: object) => { try { refresh(await api.updateNode(project.name, node.id, changes)); } catch (e) { setError((e as Error).message); } };
  const addClaim = async () => { try { refresh(await api.createClaim(project.name, node.id, claim)); setClaim(""); } catch (e) { setError((e as Error).message); } };
  const upload = async (file?: File) => { if (!file) return; try { const ref = await api.upload(project.name, node.id, file); const next = `${content}${content ? "\n\n" : ""}![${file.name}](${ref})`; setContent(next); refresh(await api.updateNode(project.name, node.id, { content: next })); } catch (e) { setError((e as Error).message); } };
  const uploadTestResults = async (file?: File) => { if (!file) return; try { refresh(await api.uploadTestResults(project.name, node.id, file)); } catch (e) { setError((e as Error).message); } };
  return <main className="detail">
    <header><div><input className="node-title" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== node.name && save({ name })} /><p className="hint">Status: {node.verification}</p></div><button onClick={async () => { const child = prompt("Name for the new sub-system node"); if (child) try { refresh(await api.createNode(project.name, node.id, child)); } catch (e) { setError((e as Error).message); } }}>Add child</button></header>
    {node.id === project.rootNodeId && <section><h2>Test results</h2><p className="hint">Attach machine-readable JSON or XUnit XML reports from the project’s test runs.</p><label className="upload">Select test results file <input type="file" accept="application/json,.json,application/xml,text/xml,.xml" onChange={(e) => uploadTestResults(e.target.files?.[0])} /></label><button onClick={async () => { try { refresh(await api.verify(project.name)); } catch (e) { setError((e as Error).message); } }}>Verify</button>{project.testResults.length > 0 && <ul className="children">{project.testResults.map((file) => <li key={file.id}>{file.fileName} <button className="danger" onClick={async () => { if (confirm(`Delete ${file.fileName}?`)) try { refresh(await api.deleteTestResults(project.name, node.id, file.id)); } catch (e) { setError((e as Error).message); } }}>Delete</button></li>)}</ul>}</section>}
    <section><h2>Claims</h2><SortableContext items={node.claims.map((item) => `claim-${item.id}`)} strategy={verticalListSortingStrategy}>{node.claims.map((item) => <ClaimEditor key={item.id} item={item} project={project.name} refresh={refresh} setError={setError} />)}</SortableContext><div className="new-claim"><textarea value={claim} onChange={(e) => setClaim(e.target.value)} placeholder="Add a verifiable claim…" /><button disabled={!claim.trim()} onClick={addClaim}>Add claim</button></div></section>
    <section><h2>Content</h2>{editingContent ? <><p className="hint">Markdown is saved directly in this node’s content file.</p><textarea className="content-editor" value={content} onChange={(e) => setContent(e.target.value)} onBlur={() => content !== node.content && save({ content })} /><div><label className="upload">Upload image <input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0])} /></label>{node.content && <button onClick={async () => { if (content !== node.content) await save({ content }); setEditingContent(false); }}>Done editing</button>}</div></> : <><button onClick={() => setEditingContent(true)}>Edit content</button><div className="markdown"><ReactMarkdown>{content.replaceAll("../assets/", `/projects/${encodeURIComponent(project.name)}/assets/`)}</ReactMarkdown></div></>}</section>
    <section><h2>Direct children</h2>{node.children.length ? <ul className="children">{node.children.map((child) => <li key={child.id}><button className="child-link" onClick={() => onSelect(child.id)}>{child.name}</button></li>)}</ul> : <p className="hint">No direct children.</p>}</section>
  </main>;
}
function ClaimEditor({ item, project, refresh, setError }: { item: NodeRecord["claims"][number]; project: string; refresh: (p: Project) => void; setError: (e: string) => void }) {
  const [text, setText] = useState(item.text); const [copied, setCopied] = useState(false); useEffect(() => setText(item.text), [item]);
  const sortable = useSortable({ id: `claim-${item.id}` });
  const statusStyle = item.verification === "verified" ? { borderLeft: "4px solid #20824a", background: "#effaf3" } : item.verification === "failed" ? { borderLeft: "4px solid #c43d4b", background: "#fff2f3" } : { borderLeft: "4px solid #c78813", background: "#fffaec" };
  const copy = async () => { try { await navigator.clipboard.writeText(item.shortId); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch (e) { setError((e as Error).message || "Could not copy identifier"); } };
  return <div ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition, ...statusStyle, gridTemplateColumns: "minmax(10rem, max-content) minmax(0, 1fr) auto", alignItems: "start" }} className="claim"><code style={{ display: "flex", alignItems: "center", gap: ".25rem", whiteSpace: "nowrap" }}><button style={{ padding: ".15rem .3rem" }} className="drag-handle" ref={sortable.setActivatorNodeRef} {...sortable.attributes} {...sortable.listeners} aria-label="Reorder claim">⠿</button>{item.shortId} · {item.verification} <button style={{ padding: ".15rem .3rem" }} onClick={copy} title="Copy claim short identifier" aria-label="Copy claim short identifier">{copied ? "✓" : "⧉"}</button></code><textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={async () => { if (text !== item.text) try { refresh(await api.updateClaim(project, item.id, text)); } catch (e) { setError((e as Error).message); } }} /><button className="danger" onClick={async () => { if (confirm("Delete this claim?")) try { refresh(await api.deleteClaim(project, item.id)); } catch (e) { setError((e as Error).message); } }}>Delete</button></div>;
}
export function App() {
  const [projects, setProjects] = useState<string[]>([]); const [project, setProject] = useState<Project>(); const [selected, setSelected] = useState(""); const [expanded, setExpanded] = useState(new Set<string>()); const [error, setError] = useState("");
  const selectedNode = useMemo(() => project && findNode(project.tree, selected), [project, selected]);
  const refresh = (next: Project) => { setProject(next); setProjects((old) => old.includes(next.name) ? old : [...old, next.name]); };
  useEffect(() => { void (async () => { try { const [availableProjects, configuration] = await Promise.all([api.projects(), api.configuration()]); setProjects(availableProjects); if (configuration.initialProject) await open(configuration.initialProject); } catch (e) { setError((e as Error).message); } })(); }, []);
  useEffect(() => { if (project) { setSelected((id) => id || project.rootNodeId); setExpanded((ids) => ids.size ? ids : new Set([project.rootNodeId])); } }, [project]);
  const open = async (name: string) => { try { refresh(await api.project(name)); setSelected(""); } catch (e) { setError((e as Error).message); } };
  const dragEnd = async (event: DragEndEvent) => {
    const id = String(event.active.id), overId = event.over && String(event.over.id); if (!project || !overId || id === overId) return;
    try {
      if (id.startsWith("claim-") && overId.startsWith("claim-") && selectedNode) {
        const oldIndex = selectedNode.claims.findIndex((claim) => `claim-${claim.id}` === id); const newIndex = selectedNode.claims.findIndex((claim) => `claim-${claim.id}` === overId);
        if (oldIndex < 0 || newIndex < 0) return;
        const orderedIds = selectedNode.claims.map((claim) => claim.id); orderedIds.splice(newIndex, 0, orderedIds.splice(oldIndex, 1)[0]);
        refresh(await api.reorderClaims(project.name, selectedNode.id, orderedIds)); return;
      }
      if (!id.startsWith("claim-") && !overId.startsWith("claim-")) { refresh(await api.moveNode(project.name, id, overId)); setExpanded((old) => new Set(old).add(overId)); }
    } catch (e) { setError((e as Error).message); }
  };
  if (!project) return <div className="welcome"><h1>System Specification Tool</h1><p>Open a specification stored in the configured server workspace.</p>{error && <p className="error">{error}</p>}<div className="project-actions"><select defaultValue="" onChange={(e) => e.target.value && open(e.target.value)}><option value="" disabled>Choose a project…</option>{projects.map((name) => <option key={name}>{name}</option>)}</select><button onClick={async () => { const name = prompt("New project name"); if (name) try { refresh(await api.createProject(name)); } catch (e) { setError((e as Error).message); } }}>Create project</button></div></div>;
  return <div className="app"><DndContext onDragEnd={dragEnd}><PanelGroup direction="horizontal"><Panel defaultSize={30} minSize={20} className="sidebar"><div className="project-header"><strong>{project.name}</strong><button onClick={() => { setProject(undefined); setSelected(""); }}>Change project</button></div><nav><ul><TreeNode node={project.tree} selected={selected} onSelect={setSelected} expanded={expanded} toggle={(id) => setExpanded((old) => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; })} /></ul></nav></Panel><PanelResizeHandle className="resize" /><Panel minSize={40}>{selectedNode && <Detail key={selectedNode.id} project={project} node={selectedNode} refresh={refresh} setError={setError} onSelect={setSelected} />}</Panel></PanelGroup></DndContext>{error && <div className="toast" onClick={() => setError("")}>{error}</div>}</div>;
}
