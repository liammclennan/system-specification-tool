import { useEffect, useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  pointerWithin,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import type { CollisionDetection, DragEndEvent } from "@dnd-kit/core";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { allNodeIds, countFailedClaims, countIgnoredClaims, findNode, type NodeRecord, type Project, type VerificationTest } from "../shared/types.ts";
import { api } from "./api.ts";
import { TestResultsView } from "./TestResultsView.tsx";
import { RenderedSpecification } from "./RenderedSpecification.tsx";
import { SubsystemDetail } from "./SubsystemDetail.tsx";

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
    localStorage.setItem(
      `system-specification-tool.expanded.${projectName}`,
      JSON.stringify([...expanded]),
    );
  } catch {
    // Continue with the in-memory expansion state when storage is unavailable.
  }
}
function TestResultsPage({ projectName }: { projectName: string }) {
  const [files, setFiles] = useState<Awaited<ReturnType<typeof api.testResults>>>();
  const [error, setError] = useState("");
  useEffect(() => {
    void api
      .testResults(projectName)
      .then(setFiles)
      .catch((reason: Error) => setError(reason.message));
  }, [projectName]);
  return (
    <main className="test-results-page">
      <a href="/">← Back to application</a>
      <h1>Test results</h1>
      <p className="hint">Tests used to verify {projectName}, grouped by result file.</p>
      {error ? (
        <p className="error">{error}</p>
      ) : files ? (
        <TestResultsView files={files} />
      ) : (
        <p>Loading test results…</p>
      )}
    </main>
  );
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
  const failedPercentage = includedClaimCount ? (failedClaimCount / includedClaimCount) * 100 : 0;
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
function WorkspaceApp() {
  const [projects, setProjects] = useState<string[]>([]);
  const [project, setProject] = useState<Project>();
  const [selected, setSelected] = useState("");
  const [expanded, setExpanded] = useState(new Set<string>());
  const [error, setError] = useState("");
  const [verificationNotice, setVerificationNotice] = useState("");
  const [verificationEnabled, setVerificationEnabled] = useState(false);
  const [tests, setTests] = useState<VerificationTest[]>([]);
  const [verifying, setVerifying] = useState(false);
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
        setVerificationEnabled(configuration.verificationEnabled);
        if (configuration.initialProject) await open(configuration.initialProject);
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
  useEffect(() => {
    if (!project || !verificationEnabled) {
      setTests([]);
      return;
    }
    void api
      .testResults(project.name)
      .then((files) => setTests(files.flatMap((file) => file.tests)))
      .catch((e) => setError((e as Error).message));
  }, [project?.name, verificationEnabled]);
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
      if (id.startsWith("claim-") && overId.startsWith("claim-") && selectedNode) {
        const oldIndex = selectedNode.claims.findIndex((claim) => `claim-${claim.id}` === id);
        const newIndex = selectedNode.claims.findIndex((claim) => `claim-${claim.id}` === overId);
        if (oldIndex < 0 || newIndex < 0) return;
        const orderedIds = selectedNode.claims.map((claim) => claim.id);
        orderedIds.splice(newIndex, 0, orderedIds.splice(oldIndex, 1)[0]);
        refresh(await api.reorderClaims(project.name, selectedNode.id, orderedIds));
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
          <select defaultValue="" onChange={(e) => e.target.value && open(e.target.value)}>
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
        <PanelGroup direction="horizontal" onLayout={(sizes) => saveSidebarSize(sizes[0])}>
          <Panel defaultSize={sidebarSize} minSize={20} className="sidebar">
            <div className="project-header">
              <details className="specification-menu">
                <summary className="header-link icon-button" aria-label="Menu" title="Menu">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </summary>
                <div className="specification-menu-items">
                  <a href="/">Specification</a>
                  <a href={`/specification/${encodeURIComponent(project.name)}`}>Rendered</a>
                  <a href={`/test-results/${encodeURIComponent(project.name)}`}>Test results</a>
                </div>
              </details>
              <strong>{project.name}</strong>
              <div className="project-header-actions">
                <button
                  className="icon-button"
                  aria-label="Expand all"
                  title="Expand all"
                  onClick={() => setExpanded(new Set(allNodeIds(project.tree)))}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
                <button
                  className="icon-button"
                  aria-label="Verify"
                  title={
                    !verificationEnabled
                      ? "Restart with a `--test-results` path to enable verification"
                      : verifying
                        ? "Verifying…"
                        : "Verify"
                  }
                  disabled={!verificationEnabled || verifying}
                  onClick={async () => {
                    setVerifying(true);
                    setError("");
                    setVerificationNotice("");
                    try {
                      const verifiedProject = await api.verify(project.name);
                      refresh(verifiedProject);
                      setTests((await api.testResults(project.name)).flatMap((file) => file.tests));
                      const root = verifiedProject.tree;
                      const unverified = Math.max(
                        0,
                        root.recursiveClaimCount -
                          root.ignoredClaimCount -
                          root.verifiedClaimCount -
                          root.failedClaimCount,
                      );
                      setVerificationNotice(
                        `Verification complete: ${root.verifiedClaimCount} verified, ${root.failedClaimCount} failed, ${unverified} unverified, ${root.ignoredClaimCount} ignored.`,
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setVerifying(false);
                    }
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m5 12 4 4L19 6" />
                  </svg>
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
              <SubsystemDetail
                key={selectedNode.id}
                project={project}
                node={selectedNode}
                tests={tests}
                refresh={refresh}
                setError={setError}
                onSelect={setSelected}
              />
            )}
          </Panel>
        </PanelGroup>
      </DndContext>
      {error && (
        <div className="toast" role="alert" onClick={() => setError("")}>
          {error}
        </div>
      )}
      {verificationNotice && (
        <div className="toast success" role="status" onClick={() => setVerificationNotice("")}>
          {verificationNotice}
        </div>
      )}
    </div>
  );
}
export function App() {
  const testsMatch = window.location.pathname.match(/^\/test-results\/([^/]+)\/?$/);
  if (testsMatch) {
    try {
      return <TestResultsPage projectName={decodeURIComponent(testsMatch[1])} />;
    } catch {
      return (
        <main className="test-results-page">
          <a href="/">← Back to application</a>
          <p className="error">The test-results URL is invalid.</p>
        </main>
      );
    }
  }
  const match = window.location.pathname.match(/^\/specification\/([^/]+)\/?$/);
  if (match) {
    try {
      return <RenderedSpecification projectName={decodeURIComponent(match[1])} />;
    } catch {
      return (
        <main className="rendered-specification">
          <a href="/">← Back to application</a>
          <p className="error">The specification URL is invalid.</p>
        </main>
      );
    }
  }
  return <WorkspaceApp />;
}
