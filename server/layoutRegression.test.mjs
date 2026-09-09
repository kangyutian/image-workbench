import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("workbench layout has safeguards for long Chinese labels", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(css, /\.workbench-main[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.workbench-topbar[^}]*min-width:\s*0/s);
  assert.match(css, /\.field span[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.batch-actions[^}]*flex-wrap:\s*wrap/s);
  assert.match(css, /\.panel h[1-4][^}]*overflow-wrap:\s*anywhere/s);
});

test("workbench exposes print extraction as a standalone tab without the recent-task rail", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /creationKind === "print"/);
  assert.match(app, /印花提取/);
  assert.doesNotMatch(app, /<aside className="recent-tasks-panel"/);
});

test("image batch panel does not reserve an empty second column", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.batch-panel \.batch-grid[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
});

test("product suite exposes the complete model profile and removes overall style", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(app, /模特年龄/);
  assert.match(app, /模特发型/);
  assert.match(app, /模特外观/);
  assert.match(app, /模特肤色/);
  assert.match(app, /模特体型/);
  assert.doesNotMatch(app, /整体视觉风格/);
  assert.doesNotMatch(app, /suiteStyle/);
});

test("image creation exposes the compact batch desk layout", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(app, /className="image-batch-desk"/);
  assert.match(app, /className="[^"]*image-batch-toolbar/);
  assert.match(app, /className={`task-list \$\{creationKind === "image" \? "image-task-grid"/);
  assert.match(app, /应用到所有任务卡/);
  assert.match(app, /全部开始/);
  assert.match(app, /批量提示词/);
});

test("image creation does not render the retired internal sidebar column", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(app, /className="image-workbench-sidebar"/);
  assert.doesNotMatch(app, /aria-label="图片任务导航"/);
});

test("video, cutout, and print creation panes share the image batch desk shell", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(app, /className="panel batch-creation-desk video-create-panel"/);
  assert.match(app, /className="panel batch-creation-desk print-create-panel"/);
  assert.match(app, /className="panel batch-creation-desk cutout-create-panel"/);
  assert.match(app, /batch-task-workspace/);
  assert.match(css, /\.batch-creation-desk[^}]*background:/s);
  assert.match(css, /\.batch-creation-desk[^}]*border-radius:/s);
  assert.match(css, /\.batch-task-workspace[^}]*display:/s);
});

test("product suite now exposes four generated views without the product detail slot", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(app, /自动抠图 \+ 4 张生成/);
  assert.match(app, /固定 4 张/);
  assert.match(app, /const MAX_PRODUCT_SUITE_IMAGES = 10/);
  assert.match(app, /type="file" accept="image\/\*" multiple/);
  assert.match(app, /images: suiteImages/);
  assert.match(app, /<option value="image2">Image 2<\/option>/);
  assert.doesNotMatch(app, /产品细节特写图|product-detail/);
});

test("each creation tab only renders its own task module", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(app, /\{\(creationKind === "image" \|\| creationKind === "print"\) &&/);
  assert.match(app, /\{creationKind === "video" && <section className="video-queue-section">/);
  assert.match(app, /\{creationKind === "cutout" && <section className="video-queue-section cutout-queue-section">/);
  assert.match(app, /\{creationKind === "suite" && renderProductSuiteQueue\(\)\}/);
  assert.match(app, /const visibleTasks = creationKind === "print"[\s\S]*tasks\.filter/);
  assert.match(app, /task\.preset === "print-extraction"/);
  assert.match(app, /task\.preset !== "print-extraction"/);
});
