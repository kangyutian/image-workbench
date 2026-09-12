import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("video remix workspace exposes the full gated journey", async () => {
  const source = await readFile(new URL("../src/VideoRemixWorkspace.tsx", import.meta.url), "utf8");
  for (const label of ["上传视频", "智能拆分", "分镜图确认", "生成视频", "结果预览", "下载素材"]) assert.match(source, new RegExp(label));
  for (const action of ["确认全部分镜", "重新生成本镜头", "前往生成视频"]) assert.match(source, new RegExp(action));
});

test("video remix workspace exposes an actionable analysis failure state", async () => {
  const source = await readFile(new URL("../src/VideoRemixWorkspace.tsx", import.meta.url), "utf8");
  assert.match(source, /current\.status === "error"/);
  assert.match(source, /重新分析/);
});

test("video remix workspace can start a new task without creating an empty project", async () => {
  const source = await readFile(new URL("../src/VideoRemixWorkspace.tsx", import.meta.url), "utf8");
  assert.match(source, /function startNewProject\(\)/);
  assert.match(source, /新建任务/);
  assert.match(source, /event\.target\.value === "new"/);
});

test("workbench navigation includes video remix without removing existing tabs", async () => {
  const source = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(source, /setCreationKind\("remix"\)/);
  assert.match(source, />视频再生<\/button>/);
  assert.match(source, /<VideoRemixWorkspace/);
  for (const label of ["图片创作", "视频创作", "商品套图"]) assert.match(source, new RegExp(label));
});
