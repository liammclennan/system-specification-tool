// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeRecord, Project } from "../shared/types.ts";

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drag-context">{children}</div>
  ),
  closestCenter: vi.fn(),
  pointerWithin: vi.fn(() => []),
  useDraggable: () => ({ setNodeRef: vi.fn(), listeners: {}, attributes: {} }),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));
vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: {},
  useSortable: () => ({
    setNodeRef: vi.fn(),
    setActivatorNodeRef: vi.fn(),
    listeners: {},
    attributes: {},
    transform: null,
    transition: undefined,
  }),
}));
vi.mock("@dnd-kit/utilities", () => ({ CSS: { Transform: { toString: () => undefined } } }));
vi.mock("react-resizable-panels", () => ({
  PanelGroup: ({ children, direction }: { children: React.ReactNode; direction: string }) => (
    <div data-testid="panel-group" data-direction={direction}>
      {children}
    </div>
  ),
  Panel: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <section className={className}>{children}</section>
  ),
  PanelResizeHandle: ({ className }: { className?: string }) => (
    <div className={className} role="separator" />
  ),
}));
vi.mock("./api.ts", () => ({
  api: {
    projects: vi.fn(),
    configuration: vi.fn(),
    project: vi.fn(),
    createProject: vi.fn(),
    createNode: vi.fn(),
    updateNode: vi.fn(),
    moveNode: vi.fn(),
    deleteNode: vi.fn(),
    createClaim: vi.fn(),
    updateClaim: vi.fn(),
    setClaimIgnored: vi.fn(),
    moveClaim: vi.fn(),
    reorderClaims: vi.fn(),
    deleteClaim: vi.fn(),
    upload: vi.fn(),
    verify: vi.fn(),
    testResults: vi.fn(),
  },
}));

import { App } from "./App.tsx";
import { api } from "./api.ts";

const child = (overrides: Partial<NodeRecord> = {}): NodeRecord => ({
  id: "child-id",
  shortId: "c222",
  name: "Child service",
  parentId: "root-id",
  content: "Child content",
  claims: [],
  children: [],
  directClaimCount: 0,
  recursiveClaimCount: 0,
  verifiedClaimCount: 0,
  failedClaimCount: 0,
  ignoredClaimCount: 0,
  verification: "verified",
  ...overrides,
});
const project = (overrides: Partial<NodeRecord> = {}): Project => ({
  id: "root-id",
  name: "System",
  rootNodeId: "root-id",
  testResults: [],
  tree: {
    id: "root-id",
    shortId: "r111",
    name: "Root system",
    parentId: null,
    content: "Root content",
    claims: [
      {
        id: "claim-id",
        shortId: "a123",
        nodeId: "root-id",
        text: "The system works.",
        verification: "unverified",
        ignored: false,
      },
    ],
    children: [child()],
    directClaimCount: 1,
    recursiveClaimCount: 1,
    verifiedClaimCount: 0,
    failedClaimCount: 0,
    ignoredClaimCount: 0,
    verification: "unverified",
    ...overrides,
  },
});

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
async function renderWorkspace(value = project()) {
  mocked.projects.mockResolvedValue([value.name]);
  mocked.configuration.mockResolvedValue({
    initialProject: value.name,
    verificationEnabled: false,
  });
  mocked.project.mockResolvedValue(value);
  render(<App />);
  await screen.findByDisplayValue(value.tree.name);
}
const renderedMarkdown = `Generated: 2026-09-04 12:00:00 +10:00

# Root system

**Verification status:** unverified

**Claims:**

- **unverified** — [a123] The system works.

**Content:**

Root content

## Child service

**Verification status:** verified

**Content:**

Child content
`;
async function renderSpecification() {
  mocked.configuration.mockResolvedValue({ initialProject: "System", verificationEnabled: false });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, text: async () => renderedMarkdown }),
  );
  window.history.pushState({}, "", "/specification/System");
  render(<App />);
  await screen.findByRole("heading", { name: "Root system" });
}

beforeEach(() => {
  vi.clearAllMocks();
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
    },
  });
  window.history.pushState({}, "", "/");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("workspace interface specification", () => {
  it("defaults to the light theme and allows switching to dark", async () => {
    await renderWorkspace();
    expect(document.documentElement.dataset.theme).toBe("light");
    await userEvent.click(screen.getByRole("button", { name: "Use dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("button", { name: "Use light theme" })).not.toBeNull();
  });

  it("cfbf organizes the application into left and right panes", async () => {
    await renderWorkspace();
    expect(screen.getByTestId("panel-group").getAttribute("data-direction")).toBe("horizontal");
    expect(document.querySelector(".sidebar")).not.toBeNull();
    expect(document.querySelector(".detail")).not.toBeNull();
  });

  it("edb1 fills the viewport and retains responsive pane classes", async () => {
    await renderWorkspace();
    expect(document.querySelector(".app")).not.toBeNull();
    expect(document.querySelector(".sidebar")).not.toBeNull();
    expect(document.querySelector(".detail")).not.toBeNull();
  });

  it("59d8 provides a draggable divider between the panes", async () => {
    await renderWorkspace();
    expect(screen.getByRole("separator").classList.contains("resize")).toBe(true);
  });

  it("6897 shows the selected subsystem detail in the right pane", async () => {
    await renderWorkspace();
    expect(
      within(document.querySelector(".detail")!).getByDisplayValue("Root system"),
    ).not.toBeNull();
  });

  it("8a80 displays the subsystem hierarchy in the left pane", async () => {
    await renderWorkspace();
    expect(within(document.querySelector(".sidebar")!).getByText("Root system")).not.toBeNull();
    expect(within(document.querySelector(".sidebar")!).getByText("Child service")).not.toBeNull();
  });

  it("bfe4 renders nested subsystem nodes as a tree", async () => {
    await renderWorkspace();
    const rootRow = document.querySelector("nav > ul > li > .tree-row")!;
    const nestedRow = document.querySelector("nav > ul > li > ul > li > .tree-row")!;
    expect(rootRow.querySelector(".tree-name")?.textContent).toBe("Root system");
    expect(nestedRow.querySelector(".tree-name")?.textContent).toBe("Child service");
  });

  it("bb46 changes the detail view when a tree node is selected", async () => {
    await renderWorkspace();
    fireEvent.click(
      [...document.querySelectorAll(".tree-name")].find(
        (item) => item.textContent === "Child service",
      )!,
    );
    expect(await screen.findByDisplayValue("Child service")).not.toBeNull();
  });

  it("64aa selects a direct child from the detail view", async () => {
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Child service" }));
    expect(await screen.findByDisplayValue("Child service")).not.toBeNull();
  });

  it("73cd 96d1 deletes a subsystem after warning that its claims move to the parent", async () => {
    const childWithClaims = child({
      claims: [
        {
          id: "child-claim",
          shortId: "d333",
          nodeId: "child-id",
          text: "Child claim",
          verification: "unverified",
          ignored: false,
        },
      ],
      directClaimCount: 1,
      recursiveClaimCount: 1,
      verification: "unverified",
    });
    const initial = project({ children: [childWithClaims], recursiveClaimCount: 2 });
    mocked.deleteNode.mockResolvedValue(project({ children: [] }));
    const confirmDelete = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmDelete);
    await renderWorkspace(initial);
    await userEvent.click(screen.getByRole("button", { name: "Child service" }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(confirmDelete).toHaveBeenCalledWith(
      "Delete Child service? Its 1 claim will be moved to the parent node.",
    );
    expect(mocked.deleteNode).toHaveBeenCalledWith("System", "child-id");
    expect(await screen.findByDisplayValue("Root system")).not.toBeNull();
  });

  it("9d2f shows node name, short identifier, claims, and direct children", async () => {
    await renderWorkspace();
    const detail = within(document.querySelector(".detail")!);
    expect(detail.getByDisplayValue("Root system")).not.toBeNull();
    expect(detail.getByText(/ID: r111/)).not.toBeNull();
    expect(detail.getByDisplayValue("The system works.")).not.toBeNull();
    expect(detail.getByRole("button", { name: "Child service" })).not.toBeNull();
  });

  it("9f8c copies a claim short identifier from the claim UI", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Copy claim short identifier" }));
    expect(writeText).toHaveBeenCalledWith("a123");
  });

  it("c73e adds a claim with the button or Enter key", async () => {
    mocked.createClaim.mockResolvedValue(project());
    await renderWorkspace();
    const input = screen.getByPlaceholderText("Add a verifiable claim…");
    await userEvent.type(input, "Button claim");
    await userEvent.click(screen.getByRole("button", { name: "Add claim" }));
    expect(mocked.createClaim).toHaveBeenCalledWith("System", "root-id", "Button claim");
    await userEvent.type(input, "Enter claim{enter}");
    expect(mocked.createClaim).toHaveBeenCalledWith("System", "root-id", "Enter claim");
  });

  it("564b returns focus to the new-claim field after adding", async () => {
    mocked.createClaim.mockResolvedValue(project());
    await renderWorkspace();
    const input = screen.getByPlaceholderText("Add a verifiable claim…");
    await userEvent.type(input, "Another claim");
    await userEvent.click(screen.getByRole("button", { name: "Add claim" }));
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it("372d expands and collapses nodes in the hierarchy", async () => {
    await renderWorkspace();
    expect(document.querySelectorAll(".tree-name")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(document.querySelectorAll(".tree-name")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(document.querySelectorAll(".tree-name")).toHaveLength(2);
  });

  it("d8ae shows each tree node name and recursive claim status indicator", async () => {
    await renderWorkspace();
    const row = [...document.querySelectorAll(".tree-row")].find((item) =>
      item.textContent?.includes("Root system"),
    )!;
    expect(row.querySelector(".count")?.textContent).toContain("1 · unverified");
    expect(
      within(row as HTMLElement).getByLabelText(
        "0 verified, 0 failed, 1 unverified, 0 ignored claims",
      ),
    ).not.toBeNull();
  });

  it("f2ce saves changed node, claim, and content fields directly without a Save action", async () => {
    mocked.updateNode.mockResolvedValue(project());
    mocked.updateClaim.mockResolvedValue(project());
    await renderWorkspace();
    const title = screen.getByDisplayValue("Root system");
    fireEvent.change(title, { target: { value: "Renamed root" } });
    fireEvent.blur(title);
    const claim = screen.getByDisplayValue("The system works.");
    fireEvent.change(claim, { target: { value: "Updated claim" } });
    fireEvent.blur(claim);
    await userEvent.click(screen.getByRole("button", { name: "Edit content" }));
    const content = screen.getByDisplayValue("Root content");
    fireEvent.change(content, { target: { value: "Updated content" } });
    fireEvent.blur(content);
    await waitFor(() => {
      expect(mocked.updateNode).toHaveBeenCalledWith("System", "root-id", { name: "Renamed root" });
      expect(mocked.updateClaim).toHaveBeenCalledWith("System", "claim-id", "Updated claim");
      expect(mocked.updateNode).toHaveBeenCalledWith("System", "root-id", {
        content: "Updated content",
      });
    });
    expect(screen.queryByRole("button", { name: /^Save$/ })).toBeNull();
  });

  it("fbb5 creates and maintains specifications from the main interface", async () => {
    mocked.projects.mockResolvedValue([]);
    mocked.configuration.mockResolvedValue({ initialProject: null, verificationEnabled: false });
    mocked.createProject.mockResolvedValue(project());
    vi.stubGlobal(
      "prompt",
      vi.fn(() => "System"),
    );
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Create project" }));
    expect(mocked.createProject).toHaveBeenCalledWith("System");
    expect(await screen.findByDisplayValue("Root system")).not.toBeNull();
  });
});

describe("rendered specification", () => {
  it("c7a4 shows the entire specification on a single page", async () => {
    await renderSpecification();
    const article = document.querySelector(".rendered-specification article")!;
    expect(
      within(article as HTMLElement).getByRole("heading", { name: "Root system" }),
    ).not.toBeNull();
    expect(
      within(article as HTMLElement).getByRole("heading", { name: "Child service" }),
    ).not.toBeNull();
  });

  it("e638 renders each subsystem node as a Markdown section", async () => {
    await renderSpecification();
    expect(screen.getByRole("heading", { level: 1, name: "Root system" })).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Child service" })).not.toBeNull();
  });

  it("138c includes all subsystem detail in its section", async () => {
    await renderSpecification();
    const article = document.querySelector(".rendered-specification article")!;
    expect(article.textContent).toContain("Verification status: unverified");
    expect(article.textContent).toContain("[a123] The system works.");
    expect(article.textContent).toContain("Root content");
  });

  it("fa3c includes child-node sections beneath their parent", async () => {
    await renderSpecification();
    const headings = [
      ...document.querySelectorAll(
        ".rendered-specification article h1, .rendered-specification article h2",
      ),
    ];
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Root system",
      "Child service",
    ]);
  });

  it("9dd3 provides table-of-contents links to every subsystem section", async () => {
    await renderSpecification();
    const contents = within(screen.getByRole("navigation", { name: "Table of contents" }));
    expect(contents.getByRole("link", { name: "Root system" }).getAttribute("href")).toBe(
      "#root-system",
    );
    expect(contents.getByRole("link", { name: "Child service" }).getAttribute("href")).toBe(
      "#child-service",
    );
  });
});
