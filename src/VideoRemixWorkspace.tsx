import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Clock3, Download, FileVideo, ImagePlus, Loader2, Play, RefreshCcw, Trash2, UploadCloud, Wand2 } from "lucide-react";
import {
  analyzeVideoRemix,
  approveVideoRemixImage,
  confirmVideoRemixScript,
  createVideoRemix,
  generateVideoRemixStoryboards,
  generateVideoRemixVideos,
  getVideoRemix,
  loadVideoRemixes,
  retryVideoRemixImage,
  retryVideoRemixVideo,
  saveVideoRemixScript,
  uploadVideoRemixProductImage,
  uploadVideoRemixSource,
} from "./lib/videoRemixApi";
import type { CreateVideoRemixInput, VideoRemixAspectRatio, VideoRemixImageModel, VideoRemixProject, VideoRemixShot, VideoRemixVideoModel } from "./videoRemixTypes";

const steps = ["上传视频", "智能拆分", "分镜图确认", "生成视频", "结果预览", "下载素材"];
const imageModels: Array<{ id: VideoRemixImageModel; label: string }> = [
  { id: "gpt-image-2.5-sunburst", label: "GPT Image 2.5 Sunburst" },
  { id: "gpt-image-2", label: "Image 2" },
  { id: "nano-banana-2-fast", label: "Nano Banana 2 Fast" },
  { id: "nano-banana-2", label: "Nano Banana 2" },
  { id: "nano-banana-pro", label: "Nano Banana Pro" },
];
const videoModels: Array<{ id: VideoRemixVideoModel; label: string }> = [
  { id: "seedance-2-fast-image-to-video", label: "Seedance 2.0 Fast" },
  { id: "seedance-2-mini-image-to-video", label: "Seedance 2.0 Mini" },
  { id: "seedance-2-image-to-video", label: "Seedance 2.0" },
  { id: "kling-3-std-image-to-video", label: "Kling 3.0 Standard" },
  { id: "kling-3-pro-image-to-video", label: "Kling 3.0 Pro" },
];

function formatSeconds(value: number) {
  return `${Math.max(0, Number(value) || 0).toFixed(2).padStart(5, "0")}s`;
}

function projectStep(project: VideoRemixProject | null, viewStage: "storyboard" | "video") {
  if (!project?.sourceVideo) return 0;
  if (project.status === "analyzing") return 1;
  if (!project.scriptConfirmedAt) return 2;
  if (viewStage === "storyboard" && project.shots.some((shot) => shot.imageStatus !== "approved")) return 2;
  if (viewStage === "video" && project.shots.some((shot) => shot.videoStatus !== "done")) return 3;
  return viewStage === "video" ? 5 : 3;
}

function imageStatusLabel(status: VideoRemixShot["imageStatus"]) {
  return status === "approved" ? "已确认" : status === "ready" ? "待确认" : status === "queued" ? "排队中" : status === "running" ? "生成中" : status === "error" ? "失败" : "待生成";
}

function videoStatusLabel(status: VideoRemixShot["videoStatus"]) {
  return status === "done" ? "已完成" : status === "queued" ? "排队中" : status === "running" ? "生成中" : status === "error" ? "失败" : "待生成";
}

export function VideoRemixWorkspace() {
  const [projects, setProjects] = useState<VideoRemixProject[]>([]);
  const [project, setProject] = useState<VideoRemixProject | null>(null);
  const [viewStage, setViewStage] = useState<"storyboard" | "video">("storyboard");
  const [title, setTitle] = useState("视频再生项目");
  const [aspectRatio, setAspectRatio] = useState<VideoRemixAspectRatio>("9:16");
  const [imageModelId, setImageModelId] = useState<VideoRemixImageModel>("gpt-image-2.5-sunburst");
  const [videoModelId, setVideoModelId] = useState<VideoRemixVideoModel>("seedance-2-fast-image-to-video");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceDuration, setSourceDuration] = useState<number | null>(null);
  const [expandedShotId, setExpandedShotId] = useState<string | null>(null);
  const [draftProject, setDraftProject] = useState<VideoRemixProject | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const sourceInput = useRef<HTMLInputElement>(null);
  const productInput = useRef<HTMLInputElement>(null);

  const current = draftProject || project;
  const step = projectStep(current, viewStage);
  const approvedCount = current?.shots.filter((shot) => shot.imageStatus === "approved").length || 0;
  const allApproved = Boolean(current?.shots.length && approvedCount === current.shots.length);
  const videoDoneCount = current?.shots.filter((shot) => shot.videoStatus === "done").length || 0;

  useEffect(() => {
    void loadVideoRemixes().then((items) => {
      setProjects(items);
      if (items[0]) setProject(items[0]);
    }).catch((loadError) => setError(loadError.message));
  }, []);

  useEffect(() => {
    if (!current || !["analyzing", "running"].includes(current.status) && !current.shots.some((shot) => ["queued", "running"].includes(shot.imageStatus) || ["queued", "running"].includes(shot.videoStatus))) return undefined;
    const timer = window.setInterval(() => {
      void getVideoRemix(current.id).then((fresh) => { setProject(fresh); setDraftProject(null); }).catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [current?.id, current?.status, current?.updatedAt, current?.shots]);

  function selectProject(next: VideoRemixProject) {
    setProject(next);
    setDraftProject(null);
    setTitle(next.title);
    setAspectRatio(next.aspectRatio);
    setImageModelId(next.imageModelId);
    setVideoModelId(next.videoModelId);
    setViewStage(next.shots.some((shot) => shot.videoStatus !== "idle") ? "video" : "storyboard");
    setError("");
  }

  async function chooseSource(file: File) {
    setError("");
    if (!["video/mp4", "video/webm", "video/quicktime"].includes(file.type)) { setError("视频仅支持 MP4、WebM 或 MOV 文件。"); return; }
    const url = URL.createObjectURL(file);
    try {
      const duration = await new Promise<number>((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => resolve(video.duration);
        video.onerror = () => reject(new Error("无法读取视频时长，请更换文件。"));
        video.src = url;
      });
      if (duration > 20) { setError("视频时长必须在 20 秒以内。"); return; }
      setSourceFile(file);
      setSourceDuration(duration);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "视频无法读取。");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function startProject() {
    if (!sourceFile) { setError("请先选择一个 20 秒以内的视频。"); return; }
    setBusy("正在上传视频"); setError("");
    try {
      const input: CreateVideoRemixInput = { title, aspectRatio, imageModelId, videoModelId };
      const created = await createVideoRemix(input);
      const uploaded = await uploadVideoRemixSource(created.id, sourceFile);
      setProject(uploaded); setProjects((items) => [uploaded, ...items.filter((item) => item.id !== uploaded.id)]);
      setBusy("正在分析视频");
      const analyzing = await analyzeVideoRemix(uploaded.id);
      setProject(analyzing);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "视频项目创建失败。");
    } finally { setBusy(""); }
  }

  async function uploadProducts(files: FileList | null) {
    if (!current || !files?.length) return;
    const available = Math.max(0, 5 - current.productImages.length);
    if (files.length > available) { setError(`最多再上传 ${available} 张产品参考图。`); return; }
    setBusy("正在上传产品参考图"); setError("");
    try {
      let next = current;
      for (const file of Array.from(files)) next = await uploadVideoRemixProductImage(current.id, file);
      setProject(next); setDraftProject(null);
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "产品图上传失败。"); }
    finally { setBusy(""); if (productInput.current) productInput.current.value = ""; }
  }

  function updateShot(shotId: string, changes: Partial<VideoRemixShot>) {
    if (!current) return;
    setDraftProject({ ...current, shots: current.shots.map((shot) => shot.id === shotId ? { ...shot, ...changes } : shot) });
  }

  function updateShots(shots: VideoRemixShot[]) {
    if (!current) return;
    setDraftProject({ ...current, shots: shots.map((shot, index) => ({ ...shot, order: index + 1 })) });
  }

  function addShot() {
    if (!current) return;
    if (current.shots.length >= 8) { setError("最多只能保留 8 个分镜。"); return; }
    const sourceDuration = current.sourceVideo?.durationSeconds || 20;
    const startSeconds = current.shots[current.shots.length - 1]?.endSeconds || 0;
    const endSeconds = Math.min(sourceDuration, startSeconds + Math.min(2, Math.max(0, sourceDuration - startSeconds)));
    if (endSeconds <= startSeconds) { setError("源视频已经没有可用时长，无法继续增加分镜。"); return; }
    const newShot: VideoRemixShot = {
      id: crypto.randomUUID(),
      order: current.shots.length + 1,
      startSeconds,
      endSeconds,
      sceneSummary: "新增镜头：请补充画面摘要。",
      imagePrompt: "沿用原视频的镜头逻辑，完整呈现上传的产品，不增加其他产品或服装。",
      videoPrompt: "保持镜头节奏自然，产品主体稳定，动作服务于商品展示。",
      sourceFrame: null,
      imageStatus: "idle",
      imageTaskId: "",
      imageResultUrl: "",
      imageError: "",
      imageApprovedAt: null,
      videoStatus: "idle",
      videoTaskId: "",
      videoResultUrl: "",
      videoError: "",
    };
    updateShots([...current.shots, newShot]);
  }

  function removeShot(shotId: string) {
    if (!current) return;
    if (current.shots.length <= 3) { setError("至少保留 3 个分镜。"); return; }
    updateShots(current.shots.filter((shot) => shot.id !== shotId));
  }

  function moveShot(shotId: string, direction: -1 | 1) {
    if (!current) return;
    const index = current.shots.findIndex((shot) => shot.id === shotId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= current.shots.length) return;
    const shots = [...current.shots];
    const first = shots[index];
    const second = shots[targetIndex];
    shots[index] = { ...second, startSeconds: first.startSeconds, endSeconds: first.endSeconds, sourceFrame: first.sourceFrame };
    shots[targetIndex] = { ...first, startSeconds: second.startSeconds, endSeconds: second.endSeconds, sourceFrame: second.sourceFrame };
    updateShots(shots);
  }

  async function saveScript(resetGenerated = false) {
    if (!current) return null;
    setBusy("正在保存脚本"); setError("");
    try {
      const saved = await saveVideoRemixScript(current.id, { title, overallScript: current.overallScript, shots: current.shots, resetGenerated });
      setProject(saved); setDraftProject(null);
      return saved;
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "脚本保存失败。"); }
    finally { setBusy(""); }
    return null;
  }

  async function confirmScript() {
    if (!current) return;
    const saved = await saveScript();
    if (!saved) return;
    setBusy("正在确认脚本"); setError("");
    try {
      const confirmed = await confirmVideoRemixScript(saved.id);
      setProject(confirmed);
      setBusy("正在创建分镜任务");
      setProject(await generateVideoRemixStoryboards(confirmed.id));
    } catch (confirmError) { setError(confirmError instanceof Error ? confirmError.message : "脚本确认失败。"); }
    finally { setBusy(""); }
  }

  async function generateStoryboards() {
    if (!current) return;
    setBusy("正在创建分镜任务"); setError("");
    try { setProject(await generateVideoRemixStoryboards(current.id)); } catch (generationError) { setError(generationError instanceof Error ? generationError.message : "分镜生成失败。"); }
    finally { setBusy(""); }
  }

  async function approveShot(shotId: string) {
    if (!current) return;
    try { setProject(await approveVideoRemixImage(current.id, shotId)); } catch (approveError) { setError(approveError instanceof Error ? approveError.message : "分镜确认失败。"); }
  }

  async function approveAllImages() {
    if (!current) return;
    const saved = draftProject ? await saveScript() : current;
    if (!saved) return;
    setBusy("正在确认全部分镜"); setError("");
    try {
      let next = saved;
      for (const shot of saved.shots.filter((item) => item.imageStatus === "ready")) {
        next = await approveVideoRemixImage(next.id, shot.id);
        setProject(next);
      }
    } catch (approveError) { setError(approveError instanceof Error ? approveError.message : "分镜确认失败。"); }
    finally { setBusy(""); }
  }

  async function retryImage(shotId: string) {
    if (!current) return;
    const saved = draftProject ? await saveScript() : current;
    if (!saved) return;
    setBusy("正在重新生成本镜头"); setError("");
    try { setProject(await retryVideoRemixImage(saved.id, shotId)); } catch (retryError) { setError(retryError instanceof Error ? retryError.message : "镜头重生成失败。"); }
    finally { setBusy(""); }
  }

  async function generateVideos() {
    if (!current) return;
    const saved = draftProject ? await saveScript() : current;
    if (!saved) return;
    setBusy("正在创建视频任务"); setError("");
    try { setProject(await generateVideoRemixVideos(saved.id)); setViewStage("video"); } catch (generationError) { setError(generationError instanceof Error ? generationError.message : "视频生成失败。"); }
    finally { setBusy(""); }
  }

  async function retryVideo(shotId: string) {
    if (!current) return;
    setBusy("正在重新生成视频"); setError("");
    try { setProject(await retryVideoRemixVideo(current.id, shotId)); } catch (retryError) { setError(retryError instanceof Error ? retryError.message : "视频重生成失败。"); }
    finally { setBusy(""); }
  }

  const titleLabel = useMemo(() => current?.title || title || "视频再生项目", [current?.title, title]);

  return <section className="video-remix-workspace">
    <header className="video-remix-heading">
      <div><p className="eyebrow">VIDEO REMIX</p><h1>{titleLabel}</h1><span>保留原视频的镜头逻辑，用你的产品重新生成独立视频片段。</span></div>
      <div className="video-remix-project-picker"><label>项目</label><select value={current?.id || "new"} onChange={(event) => { const next = projects.find((item) => item.id === event.target.value); if (next) selectProject(next); }}><option value="new">新建视频再生项目</option>{projects.map((item) => <option value={item.id} key={item.id}>{item.title || item.id}</option>)}</select></div>
    </header>

    <div className="video-remix-steps">{steps.map((label, index) => <div className={`video-remix-step ${index < step ? "complete" : ""} ${index === step ? "active" : ""}`} key={label}><span>{index < step ? <Check size={15} /> : index + 1}</span><strong>{label}</strong>{index < steps.length - 1 && <i />}</div>)}</div>

    {error && <div className="video-remix-error">{error}</div>}
    {busy && <div className="video-remix-busy"><Loader2 className="spin" size={16} />{busy}</div>}

    {!current?.sourceVideo && <section className="video-remix-upload panel">
      <div className="video-remix-upload-copy"><span className="video-remix-upload-icon"><FileVideo size={30} /></span><div><p className="eyebrow">STEP 01 · SOURCE VIDEO</p><h2>上传需要再生的视频</h2><span>支持 MP4、WebM、MOV，视频时长不超过 20 秒。系统只分析画面，不处理原音频。</span></div></div>
      <div className="video-remix-settings"><label className="field"><span>画面比例</span><select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as VideoRemixAspectRatio)}><option value="9:16">9:16 竖屏</option><option value="16:9">16:9 横屏</option><option value="1:1">1:1 方形</option></select></label><label className="field"><span>分镜图模型</span><select value={imageModelId} onChange={(event) => setImageModelId(event.target.value as VideoRemixImageModel)}>{imageModels.map((model) => <option value={model.id} key={model.id}>{model.label}</option>)}</select></label><label className="field"><span>视频模型</span><select value={videoModelId} onChange={(event) => setVideoModelId(event.target.value as VideoRemixVideoModel)}>{videoModels.map((model) => <option value={model.id} key={model.id}>{model.label}</option>)}</select></label></div>
      <div className="video-remix-file-row"><button className="secondary" type="button" onClick={() => sourceInput.current?.click()}><UploadCloud size={17} />选择视频</button><input ref={sourceInput} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void chooseSource(file); event.currentTarget.value = ""; }} /><span>{sourceFile ? `${sourceFile.name} · ${sourceDuration?.toFixed(2)} 秒` : "尚未选择视频"}</span><button className="primary" type="button" disabled={!sourceFile || Boolean(busy)} onClick={() => void startProject()}><Wand2 size={17} />开始智能分析</button></div>
    </section>}

    {current?.sourceVideo && <>
      <div className="video-remix-project-settings"><span className="settings-label">项目设置</span><label>画面比例<select value={current.aspectRatio} disabled><option>{current.aspectRatio}</option></select></label><label>图像模型<select value={current.imageModelId} disabled><option>{imageModels.find((model) => model.id === current.imageModelId)?.label || current.imageModelId}</option></select></label><label>视频模型<select value={current.videoModelId} disabled><option>{videoModels.find((model) => model.id === current.videoModelId)?.label || current.videoModelId}</option></select></label><label>每段视频时长<select disabled><option>5 秒（固定）</option></select></label><span className="settings-note"><Clock3 size={17} />每个镜头输出独立 5 秒视频，不自动拼接</span></div>
      {current.status === "analyzing" && <div className="video-remix-analysis panel"><Loader2 className="spin" size={28} /><div><p className="eyebrow">STEP 02 · SMART ANALYSIS</p><h2>正在拆解视频镜头</h2><span>提取关键帧并分析画面结构，完成后你可以手动修改脚本。</span></div></div>}
      {current.status !== "analyzing" && !current.scriptConfirmedAt && <section className="video-remix-script panel">
        <div className="video-remix-script-top"><div><p className="eyebrow">STEP 03 · SCRIPT REVIEW</p><h2>确认整体脚本与分镜</h2><span>先修改脚本，再上传你的产品参考图。只有确认后才会开始付费生成。</span></div><video controls preload="metadata" src={current.sourceVideo.previewUrl} /></div>
        <label className="field"><span>项目标题</span><input value={titleLabel} onChange={(event) => { setTitle(event.target.value); setDraftProject({ ...current, title: event.target.value }); }} /></label>
        <label className="field"><span>视频整体脚本</span><textarea value={current.overallScript} onChange={(event) => setDraftProject({ ...current, overallScript: event.target.value })} rows={4} /></label>
        <div className="video-remix-script-list-heading"><div><strong>分镜列表</strong><span>可新增、删除或调整顺序，保存后再确认脚本。</span></div><button className="secondary" type="button" disabled={current.shots.length >= 8 || Boolean(busy)} onClick={addShot}><ImagePlus size={16} />新增镜头</button></div>
        <div className="video-remix-script-shots">{current.shots.map((shot, shotIndex) => <article key={shot.id} className="video-remix-script-shot"><div><strong>{String(shot.order).padStart(2, "0")}</strong><span>{formatSeconds(shot.startSeconds)} – {formatSeconds(shot.endSeconds)}</span></div><textarea value={shot.sceneSummary} onChange={(event) => updateShot(shot.id, { sceneSummary: event.target.value })} rows={2} placeholder="镜头画面摘要" /><textarea value={shot.imagePrompt} onChange={(event) => updateShot(shot.id, { imagePrompt: event.target.value })} rows={3} placeholder="图像提示词" /><textarea value={shot.videoPrompt} onChange={(event) => updateShot(shot.id, { videoPrompt: event.target.value })} rows={2} placeholder="视频动作提示词" /><div className="video-remix-script-shot-actions"><button className="ghost" type="button" title="上移镜头" disabled={shotIndex === 0} onClick={() => moveShot(shot.id, -1)}><ArrowUp size={14} /></button><button className="ghost" type="button" title="下移镜头" disabled={shotIndex === current.shots.length - 1} onClick={() => moveShot(shot.id, 1)}><ArrowDown size={14} /></button><button className="ghost danger-ghost" type="button" title="删除镜头" disabled={current.shots.length <= 3} onClick={() => removeShot(shot.id)}><Trash2 size={14} />删除</button></div></article>)}</div>
        <div className="video-remix-product-upload"><div><strong>产品参考图</strong><span>最多 5 张，第一张作为主参考图</span></div><button className="secondary" type="button" onClick={() => productInput.current?.click()}><ImagePlus size={16} />上传产品图</button><input ref={productInput} type="file" accept="image/*" multiple hidden onChange={(event) => void uploadProducts(event.target.files)} /><div className="video-remix-product-thumbs">{current.productImages.map((image) => <img src={image.previewUrl} alt={image.fileName} key={image.mediaId} />)}</div></div>
        <div className="video-remix-script-actions"><button className="secondary" type="button" disabled={Boolean(busy)} onClick={() => void saveScript()}><RefreshCcw size={16} />保存脚本</button><button className="primary" type="button" disabled={current.productImages.length === 0 || Boolean(busy)} onClick={() => void confirmScript()}><Check size={16} />确认脚本并进入分镜</button></div>
      </section>}
      {current.scriptConfirmedAt && <section className="video-remix-matrix panel">
        <div className="video-remix-matrix-top"><div><p className="eyebrow">{viewStage === "storyboard" ? "STEP 03 · STORYBOARD REVIEW" : "STEP 04 · VIDEO GENERATION"}</p><h2>{viewStage === "storyboard" ? "分镜生产矩阵" : "独立视频片段"}</h2><span>{viewStage === "storyboard" ? "逐镜头检查商品再生分镜图，修改提示词后可单独重试。" : "每个镜头生成一个独立的 5 秒视频片段。"}</span></div><div className="video-remix-matrix-actions">{viewStage === "video" && <button className="secondary" type="button" onClick={() => setViewStage("storyboard")}>返回分镜图</button>}{viewStage === "storyboard" && <><button className="secondary" type="button" disabled={!current.shots.some((shot) => shot.imageStatus === "ready") || Boolean(busy)} onClick={() => void approveAllImages()}><Check size={16} />确认全部分镜</button><button className="primary" type="button" disabled={!allApproved || Boolean(busy)} onClick={() => void generateVideos()}><Play size={16} />前往生成视频</button></>}</div></div>
        <div className="video-remix-matrix-settings"><span>镜头 / 时间</span><span>原视频关键帧</span><span>{viewStage === "storyboard" ? "商品再生分镜图" : "视频结果"}</span><span>{viewStage === "storyboard" ? "图像提示词" : "视频提示词"}</span><span>状态 / 操作</span></div>
        <div className="video-remix-shot-list">{current.shots.map((shot) => { const expanded = expandedShotId === shot.id; const imageStatus = imageStatusLabel(shot.imageStatus); const videoStatus = videoStatusLabel(shot.videoStatus); return <article className={`video-remix-shot-row ${expanded ? "expanded" : ""}`} key={shot.id}>
          <div className="video-remix-shot-main"><button className="shot-expand" type="button" onClick={() => setExpandedShotId(expanded ? null : shot.id)}>{expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button><div className="shot-number"><strong>{String(shot.order).padStart(2, "0")}</strong><span>{formatSeconds(shot.startSeconds)} – {formatSeconds(shot.endSeconds)}</span><small>{shot.sceneSummary || "镜头画面"}</small></div><div className="shot-media original-frame">{shot.sourceFrame?.previewUrl ? <img src={shot.sourceFrame.previewUrl} alt="原视频关键帧" /> : <FileVideo size={24} />}</div><div className="shot-media result-frame">{viewStage === "storyboard" ? shot.imageResultUrl ? <img src={shot.imageResultUrl} alt="商品再生分镜图" /> : <div className="shot-media-empty"><Loader2 className={shot.imageStatus === "queued" || shot.imageStatus === "running" ? "spin" : ""} size={22} /><span>{imageStatus}</span></div> : shot.videoResultUrl ? <video controls preload="metadata" src={shot.videoResultUrl} /> : <div className="shot-media-empty"><Loader2 className={shot.videoStatus === "queued" || shot.videoStatus === "running" ? "spin" : ""} size={22} /><span>{videoStatus}</span></div>}</div><textarea value={viewStage === "storyboard" ? shot.imagePrompt : shot.videoPrompt} onChange={(event) => { if (viewStage === "storyboard") updateShot(shot.id, { imagePrompt: event.target.value }); else updateShot(shot.id, { videoPrompt: event.target.value }); }} rows={3} /><div className="shot-status-actions"><span className={`remix-status status-${viewStage === "storyboard" ? shot.imageStatus : shot.videoStatus}`}>{viewStage === "storyboard" ? imageStatus : videoStatus}</span>{viewStage === "storyboard" ? <>{shot.imageStatus === "ready" && <button className="ghost" type="button" onClick={() => void approveShot(shot.id)}><Check size={14} />确认</button>}{shot.imageStatus === "approved" && <span className="status-confirmed"><Check size={14} />已确认</span>}<button className="ghost" type="button" onClick={() => void retryImage(shot.id)}><RefreshCcw size={14} />重新生成</button></> : <>{shot.videoStatus === "error" && <button className="ghost" type="button" onClick={() => void retryVideo(shot.id)}><RefreshCcw size={14} />重试视频</button>}{shot.videoResultUrl && <a className="ghost" href={shot.videoResultUrl} target="_blank" rel="noreferrer"><Download size={14} />下载</a>}</>}</div></div>
          {expanded && <div className="video-remix-shot-expanded"><div><strong>产品参考图（最多 5 张）</strong><span>仅重新生成当前镜头，不影响其他镜头。</span></div><div className="video-remix-product-thumbs">{current.productImages.map((image) => <img src={image.previewUrl} alt={image.fileName} key={image.mediaId} />)}</div><button className="primary" type="button" onClick={() => void retryImage(shot.id)}><RefreshCcw size={16} />重新生成本镜头</button></div>}
        </article>; })}</div>
        <footer className="video-remix-matrix-footer"><div><strong>{viewStage === "storyboard" ? `已确认 ${approvedCount} / ${current.shots.length} 个分镜` : `已完成 ${videoDoneCount} / ${current.shots.length} 个视频`}</strong><span>{viewStage === "storyboard" ? "请检查每个镜头后确认，全部确认后才能进入视频生成。" : "视频片段独立生成，失败镜头可单独重试。"}</span></div>{viewStage === "storyboard" ? <button className="primary" type="button" disabled={!allApproved || Boolean(busy)} onClick={() => void generateVideos()}><Play size={16} />前往生成视频</button> : <div className="download-summary"><Download size={16} />每个镜头均可单独下载</div>}</footer>
      </section>}
    </>}
  </section>;
}
