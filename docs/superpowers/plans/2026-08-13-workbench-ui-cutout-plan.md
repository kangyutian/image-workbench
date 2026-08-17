# 工作台界面与产品抠图实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐三工作区、多任务视频和产品抠图，并验证后部署到现有新加坡服务器。

**Architecture:** 沿用现有 `TaskStore`、`TaskScheduler`、WaveSpeed 轮询和用户权限；抠图作为 `kind: "cutout"` 的工作台任务，前端复用任务状态和下载模型。前端只增加工作区与任务卡，不绕过服务器暴露 API Key。

**Tech Stack:** React 18 + TypeScript + Vite；Node HTTP server；WaveSpeed REST API；Node test runner。

## Global Constraints

- 最多 10 个图片、视频或抠图任务卡。
- 视频首帧必填，尾帧可选且最多 1 张。
- 抠图 Key 只能来自服务器环境变量。
- 交付前必须完成构建、测试和线上浏览器冒烟验证。

### Task 1: 抠图接口契约与测试

**Files:**
- Create: `server/cutoutModels.mjs`
- Create: `server/cutoutModels.test.mjs`

- [ ] 写测试：模型 endpoint、透明/白底参数归一化、图片数量和提示词校验。
- [ ] 运行 `npm test -- server/cutoutModels.test.mjs`，确认先失败。
- [ ] 实现 `cutoutModelInfo`、`normalizeCutoutInput`、`validateCutoutInput` 和环境变量选择。
- [ ] 重新运行该测试并确认通过。

### Task 2: 接入任务调度与客户端 API

**Files:**
- Modify: `server.mjs`
- Create: `src/lib/cutoutApi.ts`
- Modify: `src/types.ts`

- [ ] 为 `kind: "cutout"` 增加创建、列表、执行和结果状态；复用现有 WaveSpeed 上传与预测轮询。
- [ ] 为白底输出保留 `backgroundMode` 元数据并为下载端提供统一结果字段。
- [ ] 增加前端创建任务、上传、轮询和重试所需的 API 类型。
- [ ] 运行现有服务端测试和 TypeScript 构建。

### Task 3: 三工作区与任务卡

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] 将工作区切换扩展为图片、视频、产品抠图。
- [ ] 将视频创建表单改为最多 10 张独立视频草稿卡，首帧/尾帧分别限制，提交后继续进入共享队列。
- [ ] 新增产品抠图卡片，包含上传、目标描述、透明/白底、自动裁切、边缘优化、批量提交和结果下载。
- [ ] 调整布局、对齐、空白和响应式断点，避免文字溢出。

### Task 4: 验证与部署

**Files:**
- Modify: `README.md`（如需补充环境变量）

- [ ] 运行 `npm test` 和 `npm run build`。
- [ ] 在本地预览检查三个工作区、任务卡添加和抠图控件。
- [ ] 打包部署到服务器，保留 `.env`、`data` 与现有回滚备份。
- [ ] 线上检查首页、登录态任务列表、工作区切换和抠图入口；无误后交付。
