import express from "express";
import multer from "multer";
import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProjectStorage, StorageError } from "./storage.ts";
import { TestResultsError, verificationTests } from "./test-results.ts";
import { verificationReport } from "./report.ts";
import { isHelpRequested, HELP_TEXT, resolveStartupConfiguration } from "./startup.ts";

const app = express();
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
if (isHelpRequested(process.argv.slice(2))) {
  console.log(HELP_TEXT);
  process.exit(0);
}
let startup;
try {
  startup = resolveStartupConfiguration(
    process.argv.slice(2),
    process.env.SYSTEM_SPECIFICATION_TOOL_PROJECT,
    process.cwd(),
    process.env.SYSTEM_SPECIFICATION_TOOL_PORT,
    process.env.SYSTEM_SPECIFICATION_TOOL_TEST_RESULTS,
  );
} catch (error) {
  console.error(`Error: ${(error as Error).message}\n\n${HELP_TEXT}`);
  process.exit(1);
}
const storage = new ProjectStorage(startup.workspaceRoot);
if (process.argv.slice(2).includes("--print")) {
  if (!startup.testResultsPath) {
    console.error("Error: The --print option requires a --test-results path");
    process.exit(1);
  }
  await storage.ensureProject(startup.initialProject!);
  const result = verificationReport(
    await storage.verify(startup.initialProject!, startup.testResultsPath),
  );
  process.stdout.write(result.output);
  process.exit(result.exitCode);
}
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
app.use(express.json({ limit: "1mb" }));
const send = (res: express.Response, action: () => Promise<unknown>) =>
  action()
    .then((data) => res.json(data))
    .catch((error) =>
      res
        .status(
          error instanceof StorageError || error instanceof TestResultsError ? error.status : 500,
        )
        .json({ error: error.message || "Unexpected server error" }),
    );

app.get("/api/projects", (_req, res) => send(res, () => storage.listProjects()));
app.get("/api/config", (_req, res) =>
  res.json({
    initialProject: startup.initialProject ?? null,
    verificationEnabled: Boolean(startup.testResultsPath),
  }),
);
app.post("/api/projects", (req, res) => send(res, () => storage.createProject(req.body.name)));
app.get("/api/projects/:project", (req, res) =>
  send(res, () => storage.openProject(req.params.project)),
);
app.get("/api/projects/:project/test-results", (req, res) => {
  if (!startup.testResultsPath)
    return res
      .status(400)
      .json({ error: "Restart with a --test-results path to view test results" });
  return send(res, async () => {
    await storage.openProject(req.params.project as string);
    return verificationTests(startup.testResultsPath!);
  });
});
app.post("/api/projects/:project/nodes", (req, res) =>
  send(res, () => storage.createNode(req.params.project, req.body.parentId, req.body.name)),
);
app.patch("/api/projects/:project/nodes/:id", (req, res) =>
  send(res, () => storage.updateNode(req.params.project, req.params.id, req.body)),
);
app.post("/api/projects/:project/nodes/:id/move", (req, res) =>
  send(res, () => storage.moveNode(req.params.project, req.params.id, req.body.parentId)),
);
app.delete("/api/projects/:project/nodes/:id", (req, res) =>
  send(res, () => storage.deleteNode(req.params.project, req.params.id)),
);
app.post("/api/projects/:project/claims", (req, res) =>
  send(res, () => storage.createClaim(req.params.project, req.body.nodeId, req.body.text)),
);
app.patch("/api/projects/:project/claims/:id", (req, res) =>
  send(res, () => storage.updateClaim(req.params.project, req.params.id, req.body.text)),
);
app.post("/api/projects/:project/claims/:id/ignore", (req, res) =>
  send(res, () =>
    storage.setClaimIgnored(req.params.project, req.params.id, req.body.ignored === true),
  ),
);
app.post("/api/projects/:project/claims/:id/move", (req, res) =>
  send(res, () => storage.moveClaim(req.params.project, req.params.id, req.body.nodeId)),
);
app.post("/api/projects/:project/nodes/:nodeId/claims/reorder", (req, res) =>
  send(res, () =>
    storage.reorderClaims(req.params.project, req.params.nodeId, req.body.orderedIds),
  ),
);
app.delete("/api/projects/:project/claims/:id", (req, res) =>
  send(res, () => storage.deleteClaim(req.params.project, req.params.id)),
);
app.post("/api/projects/:project/nodes/:nodeId/assets", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "An image is required" });
  return send(res, () =>
    storage.saveAsset(req.params.project as string, req.params.nodeId as string, req.file!),
  );
});
app.post("/api/projects/:project/verify", (req, res) => {
  if (!startup.testResultsPath)
    return res
      .status(400)
      .json({ error: "Restart with a --test-results path to enable verification" });
  return send(res, () => storage.verify(req.params.project as string, startup.testResultsPath!));
});
app.use("/projects", express.static(startup.workspaceRoot));
const httpServer = createHttpServer(app);
if (process.env.SYSTEM_SPECIFICATION_TOOL_DEV === "true") {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root: packageRoot,
    server: { middlewareMode: true, hmr: { server: httpServer } },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distribution = join(packageRoot, "dist");
  app.use(express.static(distribution));
  app.get("/*path", (_req, res) => res.sendFile(join(distribution, "index.html")));
}
if (startup.initialProject) {
  console.log(`Loading project: ${startup.initialProjectPath}`);
  await storage.ensureProject(startup.initialProject);
  if (startup.testResultsPath)
    await storage.verify(startup.initialProject, startup.testResultsPath);
}
httpServer.listen(startup.port, () => {
  const browserUrl = `http://localhost:${startup.port}/`;
  console.log(`System Specification Tool listening at ${browserUrl}`);
  if (process.env.SYSTEM_SPECIFICATION_TOOL_BROWSER_MANAGED !== "true") {
    const browser =
      process.platform === "darwin"
        ? spawn("open", [browserUrl], { detached: true, stdio: "ignore" })
        : process.platform === "win32"
          ? spawn("cmd", ["/c", "start", "", browserUrl], { detached: true, stdio: "ignore" })
          : spawn("xdg-open", [browserUrl], { detached: true, stdio: "ignore" });
    browser.on("error", (error) => console.error(`Could not open the browser: ${error.message}`));
    browser.unref();
  }
});
