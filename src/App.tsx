import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUp,
  ArrowDown,
  Copy,
  Download,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Play,
  RefreshCcw,
  Save,
  Trash2,
  UploadCloud,
  Wand2,
  X,
} from "lucide-react";
import { generateImage } from "./lib/imageApi";
import type {
  GeneratedImage,
  GenerationMode,
  HistoryEntry,
  ProviderConfig,
  ProviderId,
  Quality,
  UploadedImage,
} from "./types";

const STORAGE_KEY = "ai-image-workbench-provider-configs";
const STORAGE_VERSION_KEY = "ai-image-workbench-config-version";
const CURRENT_CONFIG_VERSION = "gemai-server-model-resolve-v4";

const defaultConfigs: Record<ProviderId, ProviderConfig> = {
  nanobanana: {
    apiKey: "",
    baseUrl: "https://api.gemai.cc/v1",
    model: "__server_nanobanana_model__",
  },
  image2: {
    apiKey: "",
    baseUrl: "https://api.gemai.cc/v1",
    model: "gpt-image-2-pro",
  },
};

const providerLabels: Record<ProviderId, string> = {
  nanobanana: "nanobanana",
  image2: "image2",
};

const modeLabels: Record<GenerationMode, string> = {
  "text-to-image": "文生图",
  "image-to-image": "图生图",
  "multi-image-fusion": "多图融合",
};

function resolveMode(imageCount: number): GenerationMode {
  if (imageCount === 0) return "text-to-image";
  if (imageCount === 1) return "image-to-image";
  return "multi-image-fusion";
}

function loadConfigs() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultConfigs;
    const version = window.localStorage.getItem(STORAGE_VERSION_KEY);
    const parsed = { ...defaultConfigs, ...JSON.parse(saved) } as Record<ProviderId, ProviderConfig>;
    if (version !== CURRENT_CONFIG_VERSION) {
      return migrateLegacyConfigs(parsed);
    }
    return parsed;
  } catch {
    return defaultConfigs;
  }
}

function migrateLegacyConfigs(configs: Record<ProviderId, ProviderConfig>) {
  const nanobananaConfig = { ...configs.nanobanana };
  const image2Config = { ...configs.image2 };

  if (
    ["mock", "https://api.gemai.cc/v1beta", "https://generativelanguage.googleapis.com/v1beta"].includes(
      nanobananaConfig.baseUrl,
    ) ||
    nanobananaConfig.baseUrl === "/gemai/v1beta" ||
    nanobananaConfig.baseUrl === "/gemai/v1"
  ) {
    nanobananaConfig.baseUrl = defaultConfigs.nanobanana.baseUrl;
  }
  if (["nanobanana", "gemini-2.5-flash-image", "[?]gemini-3-pro-image-preview"].includes(nanobananaConfig.model)) {
    nanobananaConfig.model = defaultConfigs.nanobanana.model;
  }

  if (["mock", "/gemai/v1", "https://api.openai.com/v1"].includes(image2Config.baseUrl)) {
    image2Config.baseUrl = defaultConfigs.image2.baseUrl;
  }
  if (image2Config.model === "gpt-image-2") {
    image2Config.model = defaultConfigs.image2.model;
  }

  return {
    nanobanana: nanobananaConfig,
    image2: image2Config,
  };
}

function App() {
  const [provider, setProvider] = useState<ProviderId>("nanobanana");
  const [configs, setConfigs] = useState<Record<ProviderId, ProviderConfig>>(loadConfigs);
  const [showKeys, setShowKeys] = useState<Record<ProviderId, boolean>>({
    nanobanana: false,
    image2: false,
  });
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [count, setCount] = useState(1);
  const [strength, setStrength] = useState(0.65);
  const [quality, setQuality] = useState<Quality>("standard");
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [configUnlocked, setConfigUnlocked] = useState(false);
  const [configPassword, setConfigPassword] = useState("");
  const [configPasswordError, setConfigPasswordError] = useState("");
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeConfig = configs[provider];
  const mode = useMemo(() => resolveMode(images.length), [images.length]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
    window.localStorage.setItem(STORAGE_VERSION_KEY, CURRENT_CONFIG_VERSION);
  }, [configs]);

  function unlockConfigPanel() {
    if (configPassword === "P@ssw0rd7213862880") {
      setConfigUnlocked(true);
      setConfigPasswordError("");
      return;
    }
    setConfigPasswordError("密码不正确，请重新输入。");
  }

  function updateConfig(next: Partial<ProviderConfig>) {
    setConfigs((current) => ({
      ...current,
      [provider]: {
        ...current[provider],
        ...next,
      },
    }));
  }

  function saveConfigs() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
    window.localStorage.setItem(STORAGE_VERSION_KEY, CURRENT_CONFIG_VERSION);
    setSaveMessage(`${providerLabels[provider]} 配置已保存`);
    setError("");
    window.setTimeout(() => setSaveMessage(""), 1800);
  }

  function clearCurrentConfig() {
    setConfigs((current) => ({
      ...current,
      [provider]: defaultConfigs[provider],
    }));
    setSaveMessage(`${providerLabels[provider]} 已恢复默认配置`);
    window.setTimeout(() => setSaveMessage(""), 1800);
  }

  async function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
    const loaded = await Promise.all(
      files.map(
        (file) =>
          new Promise<UploadedImage>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                id: crypto.randomUUID(),
                fileName: file.name,
                dataUrl: String(reader.result),
                mimeType: file.type,
              });
            reader.onerror = () => reject(new Error(`无法读取图片：${file.name}`));
            reader.readAsDataURL(file);
          }),
      ),
    );
    setImages((current) => [...current, ...loaded]);
  }

  function moveImage(index: number, direction: -1 | 1) {
    setImages((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }

  async function handleGenerate() {
    setError("");
    if (!prompt.trim()) {
      setError("请先输入提示词。");
      return;
    }

    setIsGenerating(true);
    try {
      const generated = await generateImage({
        provider,
        apiKey: "",
        baseUrl: defaultConfigs[provider].baseUrl,
        model: defaultConfigs[provider].model,
        prompt,
        negativePrompt,
        images,
        aspectRatio,
        count,
        strength,
        quality,
      });
      setResults(generated);
      setHistory((current) => [
        {
          id: crypto.randomUUID(),
          provider,
          mode,
          prompt,
          createdAt: new Date().toLocaleString("zh-CN"),
          images: generated,
        },
        ...current,
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "生成失败，请检查接口配置。");
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyImage(image: GeneratedImage) {
    await navigator.clipboard.writeText(image.url);
  }

  function downloadImage(image: GeneratedImage, index: number) {
    const link = document.createElement("a");
    link.href = image.url;
    link.download = `ai-image-${index + 1}.png`;
    link.click();
  }

  function useAsInput(image: GeneratedImage) {
    setImages([
      {
        id: crypto.randomUUID(),
        fileName: "generated-input.png",
        dataUrl: image.url,
        mimeType: "image/png",
      },
    ]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AI Image Workbench</p>
          <h1>AI 图片生成工作台</h1>
        </div>
        <div className="status-strip">
          <span>{modeLabels[mode]}</span>
          <span>{providerLabels[provider]}</span>
          <span>{images.length} 张参考图</span>
        </div>
      </header>

      <section className="workspace-grid">
        <aside className={`panel config-panel ${configOpen ? "config-panel-open" : ""}`}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Provider</p>
              <h2>模型与密钥</h2>
            </div>
            <button className="icon-button" type="button" title="关闭配置" onClick={() => setConfigOpen(false)}>
              <X size={18} />
            </button>
          </div>

          {!configUnlocked ? (
            <div className="password-gate">
              <p className="eyebrow">Password</p>
              <h3>输入密码后配置模型密钥</h3>
              <input
                value={configPassword}
                onChange={(event) => setConfigPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") unlockConfigPanel();
                }}
                type="password"
                placeholder="请输入配置密码"
              />
              {configPasswordError && <div className="error-box compact-error">{configPasswordError}</div>}
              <button className="primary" type="button" onClick={unlockConfigPanel}>
                打开配置
              </button>
            </div>
          ) : (
            <>

          <div className="segmented" aria-label="选择模型">
            {(["nanobanana", "image2"] as ProviderId[]).map((item) => (
              <button
                className={provider === item ? "active" : ""}
                key={item}
                onClick={() => setProvider(item)}
                type="button"
              >
                {providerLabels[item]}
              </button>
            ))}
          </div>

          <label className="field">
            <span>API Key</span>
            <div className="secret-field">
              <input
                value={activeConfig.apiKey}
                onChange={(event) => updateConfig({ apiKey: event.target.value })}
                type={showKeys[provider] ? "text" : "password"}
                placeholder={`输入 ${providerLabels[provider]} API Key`}
              />
              <button
                type="button"
                title={showKeys[provider] ? "隐藏密钥" : "显示密钥"}
                onClick={() => setShowKeys((current) => ({ ...current, [provider]: !current[provider] }))}
              >
                {showKeys[provider] ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          <label className="field">
            <span>Base URL</span>
            <input
              value={activeConfig.baseUrl}
              onChange={(event) => updateConfig({ baseUrl: event.target.value })}
              placeholder="https://api.gemai.cc/v1"
            />
            <small>
              {provider === "image2"
                ? "image2 使用 gemai 的 OpenAI 兼容接口。填 mock 可测试界面流程。"
                : "nanobanana 使用 gemai 的 OpenAI 兼容生图接口。填 mock 可测试界面流程。"}
            </small>
          </label>

          <label className="field">
            <span>Model Name</span>
            <input
              value={activeConfig.model}
              onChange={(event) => updateConfig({ model: event.target.value })}
              placeholder="模型名称"
            />
          </label>

          <div className="button-row">
            <button className="secondary" type="button" onClick={saveConfigs}>
              <Save size={16} />
              保存配置
            </button>
            <button className="ghost" type="button" onClick={clearCurrentConfig}>
              <Trash2 size={16} />
              清除
            </button>
          </div>
          {saveMessage && <div className="save-message">{saveMessage}</div>}


            </>
          )}
        </aside>

        {configOpen && <div className="config-backdrop" onClick={() => setConfigOpen(false)} />}

        <aside className="panel params-panel">
          <div className="model-selector-block">
            <p className="eyebrow">Model</p>
            <div className="segmented" aria-label="选择模型">
              {(["nanobanana", "image2"] as ProviderId[]).map((item) => (
                <button
                  className={provider === item ? "active" : ""}
                  key={item}
                  onClick={() => setProvider(item)}
                  type="button"
                >
                  {providerLabels[item]}
                </button>
              ))}
            </div>
          </div>
          <div className="divider" />

          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Parameters</p>
              <h2>生成参数</h2>
            </div>
          </div>

          <label className="field">
            <span>输出数量</span>
            <input
              min={1}
              max={8}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
              type="number"
            />
          </label>

          <label className="field">
            <span>图片比例</span>
            <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>
              <option value="1:1">1:1 方图</option>
              <option value="3:4">3:4 竖图</option>
              <option value="4:3">4:3 横图</option>
              <option value="16:9">16:9 宽屏</option>
              <option value="9:16">9:16 竖屏</option>
            </select>
          </label>

          <label className="field">
            <span>参考强度 {strength.toFixed(2)}</span>
            <input
              min={0}
              max={1}
              step={0.05}
              value={strength}
              onChange={(event) => setStrength(Number(event.target.value))}
              type="range"
            />
          </label>

          <label className="field">
            <span>质量</span>
            <select value={quality} onChange={(event) => setQuality(event.target.value as Quality)}>
              <option value="standard">标准</option>
              <option value="hd">高清</option>
                <option value="2k">2K</option>
                <option value="4k">4K</option>
            </select>
          </label>

        </aside>

        <section className="panel input-panel">
          <div className="mode-banner">
            <div>
              <p className="eyebrow">Current Mode</p>
              <h2>{modeLabels[mode]}</h2>
            </div>
            <span>{mode === "text-to-image" ? "输入提示词即可生成" : "参考图顺序会参与请求"}</span>
          </div>

          <label className="field prompt-field">
            <span>主提示词</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="描述你想生成、改造或融合的画面..."
              rows={8}
            />
          </label>

          <label className="field">
            <span>负面提示词</span>
            <textarea
              value={negativePrompt}
              onChange={(event) => setNegativePrompt(event.target.value)}
              placeholder="不想出现的元素、风格或瑕疵，可留空"
              rows={3}
            />
          </label>

          <div
            className={`dropzone ${isDragging ? "dragging" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              void addFiles(event.dataTransfer.files);
            }}
          >
            <UploadCloud size={28} />
            <strong>拖拽图片到这里</strong>
            <span>支持单图改图，也支持双图/多图融合</span>
            <button className="secondary" type="button" onClick={() => fileInputRef.current?.click()}>
              <ImagePlus size={16} />
              选择图片
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                if (event.target.files) void addFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />
          </div>

          {images.length > 0 && (
            <div className="thumb-grid">
              {images.map((image, index) => (
                <article className="thumb-card" key={image.id}>
                  <img src={image.dataUrl} alt={image.fileName} />
                  <div className="thumb-meta">
                    <strong title={image.fileName}>{index + 1}. {image.fileName}</strong>
                    <span>{image.mimeType}</span>
                  </div>
                  <div className="thumb-actions">
                    <button type="button" title="上移" onClick={() => moveImage(index, -1)}>
                      <ArrowUp size={15} />
                    </button>
                    <button type="button" title="下移" onClick={() => moveImage(index, 1)}>
                      <ArrowDown size={15} />
                    </button>
                    <button type="button" title="删除" onClick={() => setImages((current) => current.filter((item) => item.id !== image.id))}>
                      <X size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {error && <div className="error-box">{error}</div>}

          <div className="generate-bar">
            <button className="primary" type="button" onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="spin" size={18} /> : <Wand2 size={18} />}
              {isGenerating ? "生成中..." : "开始生成"}
            </button>
            <button className="ghost" type="button" onClick={() => setResults([])}>
              <RefreshCcw size={16} />
              清空结果
            </button>
          </div>
        </section>

        <aside className="panel result-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Output</p>
              <h2>结果与历史</h2>
            </div>
            <ArrowDownToLine size={18} />
          </div>

          {isGenerating && (
            <div className="empty-state">
              <Loader2 className="spin" size={28} />
              <strong>正在生成图片</strong>
              <span>请求已发送到 {providerLabels[provider]}。</span>
            </div>
          )}

          {!isGenerating && results.length === 0 && (
            <div className="empty-state">
              <Play size={28} />
              <strong>结果会显示在这里</strong>
              <span>你可以先把 Base URL 填 mock 来试跑界面流程。</span>
            </div>
          )}

          {results.length > 0 && (
            <div className="result-grid">
              {results.map((image, index) => (
                <article className="result-card" key={image.id}>
                  <img src={image.url} alt={`生成结果 ${index + 1}`} />
                  <div className="result-actions">
                    <button type="button" onClick={() => downloadImage(image, index)} title="下载">
                      <Download size={15} />
                    </button>
                    <button type="button" onClick={() => void copyImage(image)} title="复制链接或 base64">
                      <Copy size={15} />
                    </button>
                    <button type="button" onClick={() => useAsInput(image)} title="作为参考图继续生成">
                      <ImagePlus size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="history-section">
            <h3>本次会话历史</h3>
            {history.length === 0 ? (
              <p className="muted">暂无历史记录。</p>
            ) : (
              <div className="history-list">
                {history.map((entry) => (
                  <button className="history-item" key={entry.id} type="button" onClick={() => setResults(entry.images)}>
                    <span>{providerLabels[entry.provider]} · {modeLabels[entry.mode]}</span>
                    <strong>{entry.prompt}</strong>
                    <small>{entry.createdAt} · {entry.images.length} 张</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}

export default App;
