import express from "express";
import multer from "multer";
import { ProjectStorage, StorageError } from "./storage.ts";
import { resolveStartupConfiguration } from "./startup.ts";

const app = express();
const startup = resolveStartupConfiguration(process.argv.slice(2), process.env.WORKSPACE_ROOT, process.env.SYSTEM_SPECIFICATION_TOOL_PROJECT, process.cwd(), process.env.SYSTEM_SPECIFICATION_TOOL_PORT, process.env.SYSTEM_SPECIFICATION_TOOL_API_PORT);
const storage = new ProjectStorage(startup.workspaceRoot);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
app.use(express.json({ limit: "1mb" }));
const send = (res: express.Response, action: () => Promise<unknown>) => action().then((data) => res.json(data)).catch((error) => res.status(error instanceof StorageError ? error.status : 500).json({ error: error.message || "Unexpected server error" }));

app.get("/api/projects", (_req, res) => send(res, () => storage.listProjects()));
app.get("/api/config", (_req, res) => res.json({ initialProject: startup.initialProject ?? null }));
app.post("/api/projects", (req, res) => send(res, () => storage.createProject(req.body.name)));
app.get("/api/projects/:project", (req, res) => send(res, () => storage.openProject(req.params.project)));
app.post("/api/projects/:project/nodes", (req, res) => send(res, () => storage.createNode(req.params.project, req.body.parentId, req.body.name)));
app.patch("/api/projects/:project/nodes/:id", (req, res) => send(res, () => storage.updateNode(req.params.project, req.params.id, req.body)));
app.post("/api/projects/:project/nodes/:id/move", (req, res) => send(res, () => storage.moveNode(req.params.project, req.params.id, req.body.parentId)));
app.post("/api/projects/:project/claims", (req, res) => send(res, () => storage.createClaim(req.params.project, req.body.nodeId, req.body.text)));
app.patch("/api/projects/:project/claims/:id", (req, res) => send(res, () => storage.updateClaim(req.params.project, req.params.id, req.body.text)));
app.post("/api/projects/:project/nodes/:nodeId/claims/reorder", (req, res) => send(res, () => storage.reorderClaims(req.params.project, req.params.nodeId, req.body.orderedIds)));
app.delete("/api/projects/:project/claims/:id", (req, res) => send(res, () => storage.deleteClaim(req.params.project, req.params.id)));
app.post("/api/projects/:project/nodes/:nodeId/assets", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "An image is required" });
  return send(res, () => storage.saveAsset(req.params.project as string, req.params.nodeId as string, req.file!));
});
app.post("/api/projects/:project/nodes/:nodeId/test-results", upload.single("testResults"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "A test results file is required" });
  return send(res, () => storage.saveTestResults(req.params.project as string, req.params.nodeId as string, req.file!));
});
app.delete("/api/projects/:project/nodes/:nodeId/test-results/:id", (req, res) => send(res, () => storage.deleteTestResults(req.params.project, req.params.nodeId, req.params.id)));
app.post("/api/projects/:project/verify", (req, res) => send(res, () => storage.verify(req.params.project)));
app.use("/projects", express.static(startup.workspaceRoot));
if (startup.initialProject) {
  console.log(`Loading project: ${startup.initialProjectPath}`);
  await storage.ensureProject(startup.initialProject);
}
app.listen(startup.apiPort, () => console.log(`System Specification Tool API listening on port ${startup.apiPort}`));
