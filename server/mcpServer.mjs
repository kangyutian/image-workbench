import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const MCP_TOOL_NAMES = [
  "list_capabilities",
  "get_upload",
  "list_tasks",
  "get_task",
  "list_product_suites",
  "get_product_suite",
  "get_task_download",
  "get_product_suite_download",
  "create_upload_ticket",
  "create_image_task",
  "create_video_task",
  "create_cutout_task",
  "create_product_suite",
  "retry_task",
  "cancel_task",
  "retry_product_suite_slot",
];

export function buildMcpInstructions() {
  return "你正在使用 image-workbench 的 codex-mcp 独立账号。写操作可能产生 WaveSpeedAI 费用，执行前必须确认；任务是异步的，创建后至少每5秒查询一次，不要因请求超时重复提交。只能访问 codex-mcp 自己的任务。图片附件必须严格小于10MB，视频沿用服务限制。";
}

export function mcpToolAnnotations(write, destructive = false) {
  return {
    readOnlyHint: !write,
    destructiveHint: Boolean(destructive),
    idempotentHint: !write || destructive,
    openWorldHint: false,
  };
}

export function toolResult(value) {
  return {
    structuredContent: value && typeof value === "object" ? value : { value },
    content: [{ type: "text", text: JSON.stringify(value) }],
  };
}

function toolError(error) {
  const message = error instanceof Error ? error.message : "MCP 工具执行失败。";
  const safeMessage = /api[_ -]?key|token|secret|password|staged|\\|\//i.test(message) ? "MCP 工具执行失败，请检查参数或稍后重试。" : message;
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: safeMessage }) }] };
}

function mediaRefSchema() {
  return z.union([
    z.object({ media_id: z.string().min(1) }).strict(),
    z.object({ url: z.string().url() }).strict(),
  ]);
}

const baseWrite = {
  idempotency_key: z.string().min(8).max(128),
};

const imageTaskSchema = {
  ...baseWrite,
  model: z.string().min(1),
  prompt: z.string().min(1).max(12000),
  images: z.array(mediaRefSchema()).max(10).default([]),
  count: z.number().int().min(1).max(8).optional(),
  aspect_ratio: z.string().optional(),
  resolution: z.string().optional(),
  quality: z.string().optional(),
  options: z.record(z.string(), z.unknown()).optional(),
};

const videoTaskSchema = {
  ...baseWrite,
  model: z.string().min(1),
  prompt: z.string().min(1).max(12000),
  first_frame: mediaRefSchema().optional(),
  end_frame: mediaRefSchema().optional(),
  motion_reference: mediaRefSchema().optional(),
  duration: z.union([z.number(), z.string()]).optional(),
  aspect_ratio: z.string().optional(),
  resolution: z.string().optional(),
  audio: z.boolean().optional(),
  options: z.record(z.string(), z.unknown()).optional(),
};

function operation(operations, name) {
  const fn = operations?.[name];
  if (typeof fn !== "function") throw new Error(`MCP operation ${name} is not configured.`);
  return fn;
}

export function createMcpServer({ operations = {}, serverVersion = "1.0.0" } = {}) {
  const server = new McpServer(
    { name: "image-workbench", version: serverVersion },
    { instructions: buildMcpInstructions() },
  );

  const register = (name, config, handler, destructive = false) => {
    const { write = false, ...toolConfig } = config;
    server.registerTool(name, {
      ...toolConfig,
      annotations: mcpToolAnnotations(write, destructive),
    }, async (args) => {
      try {
        return toolResult(await handler(args));
      } catch (error) {
        return toolError(error);
      }
    });
  };

  register("list_capabilities", { description: "列出当前可用模型、输入模式和媒体限制。", inputSchema: {} }, () => operation(operations, "listCapabilities")({}));
  register("get_upload", { description: "查询一次性媒体上传状态。", inputSchema: { upload_id: z.string().min(1) } }, ({ upload_id }) => operation(operations, "getUpload")({ uploadId: upload_id }));
  register("list_tasks", { description: "列出 codex-mcp 账号自己的图片、视频和抠图任务。", inputSchema: { kind: z.string().optional(), status: z.string().optional(), limit: z.number().int().min(1).max(100).optional() } }, (args) => operation(operations, "listTasks")(args));
  register("get_task", { description: "查询一个自己的任务及结果。", inputSchema: { task_id: z.string().min(1) } }, ({ task_id }) => operation(operations, "getTask")({ taskId: task_id }));
  register("list_product_suites", { description: "列出自己的商品套图任务。", inputSchema: {} }, () => operation(operations, "listProductSuites")({}));
  register("get_product_suite", { description: "查询自己的商品套图及各画面状态。", inputSchema: { suite_id: z.string().min(1) } }, ({ suite_id }) => operation(operations, "getProductSuite")({ suiteId: suite_id }));
  register("get_task_download", { description: "获取自己的任务结果短时效下载地址。", inputSchema: { task_id: z.string().min(1) } }, ({ task_id }) => operation(operations, "getTaskDownload")({ taskId: task_id }));
  register("get_product_suite_download", { description: "获取自己的商品套图 ZIP 短时效下载地址。", inputSchema: { suite_id: z.string().min(1) } }, ({ suite_id }) => operation(operations, "getProductSuiteDownload")({ suiteId: suite_id }));

  register("create_upload_ticket", {
    description: "为本地图片或视频创建一次性上传票据。",
    write: true,
    inputSchema: {
      ...baseWrite,
      file_name: z.string().min(1).max(200),
      mime_type: z.string().min(1),
      size: z.number().int().positive(),
      media_kind: z.enum(["image", "video"]),
    },
  }, (args) => operation(operations, "createUploadTicket")(args));
  register("create_image_task", { description: "创建异步图片生成任务。", write: true, inputSchema: imageTaskSchema }, (args) => operation(operations, "createImageTask")(args));
  register("create_video_task", { description: "创建异步视频生成任务，支持首帧、尾帧和运动参考视频。", write: true, inputSchema: videoTaskSchema }, (args) => operation(operations, "createVideoTask")(args));
  register("create_cutout_task", {
    description: "创建异步产品抠图任务。",
    write: true,
    inputSchema: { ...baseWrite, image: mediaRefSchema(), background: z.enum(["transparent", "white"]) },
  }, (args) => operation(operations, "createCutoutTask")(args));
  register("create_product_suite", {
    description: "创建包含四张固定画面的商品详情页套图任务。",
    write: true,
    inputSchema: {
      ...baseWrite,
      product_image: mediaRefSchema().optional(),
      product_images: z.array(mediaRefSchema()).min(1).max(10).optional(),
      background_image: mediaRefSchema().optional(),
      product_name: z.string().max(500).optional(),
      selling_points: z.string().max(4000).optional(),
      visual_style: z.string().max(2000).optional(),
      model: z.enum(["kling", "nanobanana", "image2", "image2.5-sunburst"]).optional(),
      gender: z.enum(["female", "male"]).optional(),
      body_type: z.enum(["slim", "balanced", "athletic", "muscular", "plus", "curvy", "hourglass", "fat", "voluptuous"]).optional(),
      age_range: z.enum(["18-24", "25-35", "36-45", "46-55", "56-plus"]).optional(),
      hair_style: z.enum(["natural-loose", "long-straight", "long-wavy", "low-ponytail", "high-ponytail", "short", "bob"]).optional(),
      hair_color: z.enum(["natural", "black", "dark-brown", "light-brown", "blonde", "copper-red", "silver-gray"]).optional(),
      skin_tone: z.enum(["natural", "fair", "medium", "tan", "deep"]).optional(),
      model_appearance: z.enum(["unspecified", "white", "black", "east-asian", "south-asian", "southeast-asian", "hispanic-latino", "mena", "indigenous", "pacific-islander", "mixed", "custom"]).optional(),
      model_appearance_custom: z.string().max(120).optional(),
      model_reference_image: mediaRefSchema().optional(),
      prompts: z.record(z.string(), z.string().max(4000)).optional(),
    },
  }, (args) => operation(operations, "createProductSuite")(args));
  register("retry_task", { description: "重试一个失败的自己的任务。", write: true, inputSchema: { ...baseWrite, task_id: z.string().min(1) }, }, (args) => operation(operations, "retryTask")(args));
  register("cancel_task", { description: "取消一个自己的排队或运行中任务。", write: true, inputSchema: { ...baseWrite, task_id: z.string().min(1) }, }, (args) => operation(operations, "cancelTask")(args), true);
  register("retry_product_suite_slot", { description: "单独重试商品套图中的一个失败画面。", write: true, inputSchema: { ...baseWrite, suite_id: z.string().min(1), slot: z.string().min(1) }, }, (args) => operation(operations, "retryProductSuiteSlot")(args));

  return server;
}
