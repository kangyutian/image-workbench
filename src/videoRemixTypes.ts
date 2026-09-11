export type VideoRemixAspectRatio = "9:16" | "16:9" | "1:1";
export type VideoRemixImageModel = "gpt-image-2.5-sunburst" | "gpt-image-2" | "nano-banana-2-fast" | "nano-banana-2" | "nano-banana-pro" | "nano-banana-pro-edit-multi";
export type VideoRemixVideoModel = "seedance-2-mini-image-to-video" | "seedance-2-fast-image-to-video" | "seedance-2-image-to-video" | "kling-3-std-image-to-video" | "kling-3-pro-image-to-video";
export type VideoRemixStatus = "draft" | "uploaded" | "analyzing" | "script_review" | "script_confirmed" | "running" | "ready" | "partial" | "done" | "error";
export type VideoRemixImageStatus = "idle" | "queued" | "running" | "ready" | "approved" | "error";
export type VideoRemixVideoStatus = "idle" | "queued" | "running" | "done" | "error";

export interface VideoRemixMedia {
  mediaId: string;
  fileName: string;
  mimeType: string;
  size?: number;
  timestampSeconds?: number;
  isPrimary?: boolean;
  previewUrl?: string;
}

export interface VideoRemixSourceVideo extends VideoRemixMedia {
  durationSeconds: number;
  width: number;
  height: number;
}

export interface VideoRemixShot {
  id: string;
  order: number;
  startSeconds: number;
  endSeconds: number;
  sceneSummary: string;
  imagePrompt: string;
  videoPrompt: string;
  sourceFrame: VideoRemixMedia | null;
  imageStatus: VideoRemixImageStatus;
  imageTaskId: string;
  imageResultUrl: string;
  imageError: string;
  imageApprovedAt: string | null;
  videoStatus: VideoRemixVideoStatus;
  videoTaskId: string;
  videoResultUrl: string;
  videoError: string;
}

export interface VideoRemixProject {
  id: string;
  title: string;
  status: VideoRemixStatus;
  aspectRatio: VideoRemixAspectRatio;
  imageModelId: VideoRemixImageModel;
  videoModelId: VideoRemixVideoModel;
  clipDuration: 5;
  sourceVideo: VideoRemixSourceVideo | null;
  frames: VideoRemixMedia[];
  productImages: VideoRemixMedia[];
  overallScript: string;
  shots: VideoRemixShot[];
  scriptConfirmedAt: string | null;
  analysisCompletedAt: string | null;
  error: string;
  updatedAt: string;
}

export interface VideoRemixUploadResult {
  project: VideoRemixProject;
}

export interface CreateVideoRemixInput {
  title?: string;
  aspectRatio: VideoRemixAspectRatio;
  imageModelId: VideoRemixImageModel;
  videoModelId: VideoRemixVideoModel;
}
