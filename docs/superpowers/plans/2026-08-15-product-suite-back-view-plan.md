# 商品套图背面展示图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将商品套图从固定 5 张扩展为固定 6 张，新增同一位模特背对镜头展示商品背面的 `model-back` 画面。

**Architecture:** 继续使用现有 `PRODUCT_SUITE_SLOTS` 作为后端任务、默认文案、状态汇总和 ZIP 文件名的唯一顺序来源；前端维护对应的展示文案配置和共享 TypeScript slot 联合类型。旧任务数据不迁移，新建任务才包含 6 个子画面。

**Tech Stack:** Node.js ESM、Node test runner、React 18、TypeScript、Vite、现有 ProductSuiteStore/TaskScheduler/ZIP 实现。

## Global Constraints

- 新任务固定包含 6 个画面，不支持增删。
- 新增背面画面必须使用同一位模特、同一体型、统一背景、统一模型、4:5、2K。
- 旧 5 张任务必须继续可读、展示、下载和删除，不补生成背面图。
- 单张文案编辑、单张重试、单张下载和整套 ZIP 下载必须保留。
- 不修改 `.env`、用户数据、任务数据或用量数据。

---

### Task 1: Extend the canonical product-suite slots and prompts

**Files:**
- Modify: `server/productSuiteModels.mjs`
- Test: `server/productSuiteModels.test.mjs`

**Interfaces:**
- Produces a new canonical slot `{ slot: "model-back", label: "欧美模特背面上身展示图", fileName: "04-model-back.jpg" }`.
- Produces the default `model-back` prompt used by `buildProductSuitePrompts()`.

- [ ] **Step 1: Write failing tests**

Add assertions that `PRODUCT_SUITE_SLOTS` contains six slots in this order:

```js
assert.deepEqual(PRODUCT_SUITE_SLOTS.map((item) => item.slot), [
  "product-3d", "model-front", "model-angle", "model-back", "model-scene", "product-detail",
]);
assert.match(prompts["model-back"], /背对镜头|背面/);
assert.match(prompts["model-back"], /同一位|同一/);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test server/productSuiteModels.test.mjs`

Expected: FAIL because the canonical slot list currently has five entries and no `model-back` prompt.

- [ ] **Step 3: Implement the minimal model change**

Insert `model-back` between `model-angle` and `model-scene`, assign `04-model-back.jpg`, and add a template that requires the same European/American model to face away from the camera and clearly expose the product back structure while preserving color, material, pattern, straps, fasteners, cut and silhouette.

- [ ] **Step 4: Run the focused test**

Run: `node --test server/productSuiteModels.test.mjs`

Expected: PASS, including existing default gender/body/background and custom prompt tests.

- [ ] **Step 5: Commit the model change**

```bash
git add server/productSuiteModels.mjs server/productSuiteModels.test.mjs
git commit -m "feat: add product suite back-view slot"
```

### Task 2: Wire six-slot task creation, status, retry, and ZIP behavior

**Files:**
- Modify: `server/productSuiteModels.test.mjs`
- Test: `server/productSuiteArchive.test.mjs`
- Verify: `server.mjs`, `server/productSuiteStore.mjs`

**Interfaces:**
- `createProductSuiteTask()` continues to derive `items` from `PRODUCT_SUITE_SLOTS`, so new parents create six items automatically.
- `executeProductSuiteTask()` continues to run every non-done item, so `model-back` receives its own child task.
- `handleProductSuiteRetry()` accepts `model-back` through the canonical slot list.
- `handleProductSuiteDownload()` derives ZIP entries from canonical slot file names.

- [ ] **Step 1: Add canonical filename coverage**

Extend the canonical slot assertions to require the complete ordered filename list:

```js
assert.deepEqual(PRODUCT_SUITE_SLOTS.map((item) => item.fileName), [
  "01-product-3d.jpg", "02-model-front.jpg", "03-model-angle.jpg",
  "04-model-back.jpg", "05-model-scene.jpg", "06-product-detail.jpg",
]);
```

- [ ] **Step 2: Run the focused model and archive tests**

Run: `node --test server/productSuiteModels.test.mjs server/productSuiteArchive.test.mjs`

Expected: PASS; the generic archive builder remains unchanged because `server.mjs` supplies it from `PRODUCT_SUITE_SLOTS`.

- [ ] **Step 3: Verify the backend uses the canonical list without special-casing five**

Inspect `server.mjs` paths for suite creation, execution, prompt patching, retry validation, and ZIP entry generation. Keep those paths derived from `PRODUCT_SUITE_SLOTS`; do not add a second hard-coded slot list.

- [ ] **Step 4: Run the focused backend tests**

Run: `node --test server/productSuiteModels.test.mjs server/productSuiteArchive.test.mjs server/productSuiteStore.test.mjs`

Expected: PASS, including legacy store compatibility.

- [ ] **Step 5: Commit the backend verification**

```bash
git add server/productSuiteModels.test.mjs server/productSuiteArchive.test.mjs
git commit -m "test: cover six-image product suite archive order"
```

### Task 3: Update shared types and the product-suite UI

**Files:**
- Modify: `src/productSuiteTypes.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- `ProductSuiteSlot` includes `"model-back"`.
- The local `productSuiteSlots` display configuration includes the same six-slot order and a default editable label/template for the back-view card.
- Existing prompt editing, retry, preview, per-image download, suite download, and status rendering consume the expanded slot list without separate five-item limits.

- [ ] **Step 1: Add the shared type and UI entry**

Add `model-back` to the TypeScript union and insert this UI descriptor between angle and scene:

```ts
{ slot: "model-back", label: "欧美模特背面上身展示图", eyebrow: "04 · Model Back", template: "同一位欧美模特背对镜头展示商品背面，完整展示后背结构、肩带、扣位、轮廓和版型。" }
```

- [ ] **Step 2: Verify all UI maps remain data-driven**

Check that cards, prompt initialization, prompt reset, retry handlers, item lookup, and the suite task count use the slot array or server items rather than fixed five-item indexes. Preserve the existing single-item edit behavior.

- [ ] **Step 3: Run TypeScript and production build**

Run: `npm.cmd run build`

Expected: PASS with no missing `ProductSuiteSlot` cases or JSX type errors.

- [ ] **Step 4: Commit the UI/type change**

```bash
git add src/productSuiteTypes.ts src/App.tsx
git commit -m "feat: show product suite back-view card"
```

### Task 4: Full verification and deployment readiness

**Files:**
- Verify: `server/productSuiteModels.mjs`, `server.mjs`, `src/App.tsx`, `src/productSuiteTypes.ts`, `server/productSuiteArchive.test.mjs`

- [ ] **Step 1: Run the full automated suite**

Run: `npm.cmd test`

Expected: all tests pass, including legacy five-item store and ZIP tests.

- [ ] **Step 2: Run production checks**

Run: `npm.cmd run build; node --check server.mjs; git diff --check`

Expected: TypeScript/Vite build, Node syntax check, and whitespace check all pass.

- [ ] **Step 3: Verify the final diff**

Confirm only the six-slot product-suite behavior, tests, and UI/type definitions changed; do not include `.env`, user/task/usage data, or unrelated worktree edits.

- [ ] **Step 4: Prepare deployment handoff**

Before deployment, create a server backup of the current code and `dist` only. Preserve the server `.env`, users, tasks, product suites, staged uploads, and usage ledger. Deploy the built files, restart `image-workbench.service`, then verify service status, page HTTP 200, authenticated suite listing, a six-card suite response, single-item retry route, and ZIP download authorization.
