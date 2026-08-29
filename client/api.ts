import type { Project } from "../shared/types.ts";
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, ...init });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "Request failed");
  return response.json();
}
export const api = {
  configuration: () => request<{ initialProject: string | null }>("/api/config"),
  projects: () => request<string[]>("/api/projects"),
  createProject: (name: string) => request<Project>("/api/projects", { method: "POST", body: JSON.stringify({ name }) }),
  project: (name: string) => request<Project>(`/api/projects/${encodeURIComponent(name)}`),
  createNode: (project: string, parentId: string, name: string) => request<Project>(`/api/projects/${encodeURIComponent(project)}/nodes`, { method: "POST", body: JSON.stringify({ parentId, name }) }),
  updateNode: (project: string, id: string, changes: object) => request<Project>(`/api/projects/${encodeURIComponent(project)}/nodes/${id}`, { method: "PATCH", body: JSON.stringify(changes) }),
  moveNode: (project: string, id: string, parentId: string) => request<Project>(`/api/projects/${encodeURIComponent(project)}/nodes/${id}/move`, { method: "POST", body: JSON.stringify({ parentId }) }),
  createClaim: (project: string, nodeId: string, text: string) => request<Project>(`/api/projects/${encodeURIComponent(project)}/claims`, { method: "POST", body: JSON.stringify({ nodeId, text }) }),
  updateClaim: (project: string, id: string, text: string) => request<Project>(`/api/projects/${encodeURIComponent(project)}/claims/${id}`, { method: "PATCH", body: JSON.stringify({ text }) }),
  reorderClaims: (project: string, nodeId: string, orderedIds: string[]) => request<Project>(`/api/projects/${encodeURIComponent(project)}/nodes/${nodeId}/claims/reorder`, { method: "POST", body: JSON.stringify({ orderedIds }) }),
  deleteClaim: (project: string, id: string) => request<Project>(`/api/projects/${encodeURIComponent(project)}/claims/${id}`, { method: "DELETE" }),
  async upload(project: string, nodeId: string, file: File) {
    const data = new FormData(); data.append("image", file);
    const response = await fetch(`/api/projects/${encodeURIComponent(project)}/nodes/${nodeId}/assets`, { method: "POST", body: data });
    if (!response.ok) throw new Error((await response.json()).error ?? "Upload failed"); return response.json() as Promise<string>;
  },
  async uploadTestResults(project: string, nodeId: string, file: File) {
    const data = new FormData(); data.append("testResults", file);
    const response = await fetch(`/api/projects/${encodeURIComponent(project)}/nodes/${nodeId}/test-results`, { method: "POST", body: data });
    if (!response.ok) throw new Error((await response.json()).error ?? "Upload failed"); return response.json() as Promise<Project>;
  },
  deleteTestResults: (project: string, nodeId: string, id: string) => request<Project>(`/api/projects/${encodeURIComponent(project)}/nodes/${nodeId}/test-results/${id}`, { method: "DELETE" })
  ,verify: (project: string) => request<Project>(`/api/projects/${encodeURIComponent(project)}/verify`, { method: "POST" })
};
