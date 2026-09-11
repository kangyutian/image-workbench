import { prepareProductSuiteImage } from "./productSuiteImageCompression";
import type { CreateVideoRemixInput, VideoRemixProject, VideoRemixShot } from "../videoRemixTypes";

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || `请求失败（${response.status}）。`);
  return body;
}

export async function createVideoRemix(input: CreateVideoRemixInput) {
  return (await request("/workbench/video-remixes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })).project as VideoRemixProject;
}

export async function loadVideoRemixes() {
  return ((await request("/workbench/video-remixes")).projects || []) as VideoRemixProject[];
}

export async function getVideoRemix(id: string) {
  return (await request(`/workbench/video-remixes/${encodeURIComponent(id)}`)).project as VideoRemixProject;
}

export async function uploadVideoRemixSource(id: string, file: File) {
  return (await request(`/workbench/video-remixes/${encodeURIComponent(id)}/source-video`, {
    method: "POST",
    headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) },
    body: file,
  })).project as VideoRemixProject;
}

export async function analyzeVideoRemix(id: string) {
  return (await request(`/workbench/video-remixes/${encodeURIComponent(id)}/analyze`, { method: "POST" })).project as VideoRemixProject;
}

export async function uploadVideoRemixProductImage(id: string, file: File) {
  const media = await prepareProductSuiteImage(file);
  const staged = (await request("/workbench/stage-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ media }) })).media as { stagedUploadId: string };
  return (await request(`/workbench/video-remixes/${encodeURIComponent(id)}/product-images`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stagedUploadId: staged.stagedUploadId }) })).project as VideoRemixProject;
}

export async function saveVideoRemixScript(id: string, input: Pick<VideoRemixProject, "title" | "overallScript"> & { shots: VideoRemixShot[]; resetGenerated?: boolean }) {
  return (await request(`/workbench/video-remixes/${encodeURIComponent(id)}/script`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })).project as VideoRemixProject;
}

export async function confirmVideoRemixScript(id: string) {
  return (await request(`/workbench/video-remixes/${encodeURIComponent(id)}/confirm-script`, { method: "POST" })).project as VideoRemixProject;
}

export async function generateVideoRemixStoryboards(id: string) {
  return (await request(`/workbench/video-remixes/${encodeURIComponent(id)}/storyboards`, { method: "POST" })).project as VideoRemixProject;
}

export async function retryVideoRemixImage(id: string, shotId: string) {
  return (await request(`/workbench/video-remixes/${encodeURIComponent(id)}/shots/${encodeURIComponent(shotId)}/retry-image`, { method: "POST" })).project as VideoRemixProject;
}

export async function approveVideoRemixImage(id: string, shotId: string) {
  return (await request(`/workbench/video-remixes/${encodeURIComponent(id)}/shots/${encodeURIComponent(shotId)}/approve-image`, { method: "POST" })).project as VideoRemixProject;
}

export async function generateVideoRemixVideos(id: string) {
  return (await request(`/workbench/video-remixes/${encodeURIComponent(id)}/videos`, { method: "POST" })).project as VideoRemixProject;
}

export async function retryVideoRemixVideo(id: string, shotId: string) {
  return (await request(`/workbench/video-remixes/${encodeURIComponent(id)}/shots/${encodeURIComponent(shotId)}/retry-video`, { method: "POST" })).project as VideoRemixProject;
}

export async function deleteVideoRemix(id: string) {
  await request(`/workbench/video-remixes/${encodeURIComponent(id)}`, { method: "DELETE" });
}
