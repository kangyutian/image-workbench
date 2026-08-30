# 图片创作 Batch Desk 视觉 QA

## Comparison target

- source visual truth path: `C:/Users/kangy/.codex/generated_images/019fc825-2fd5-79e2-8726-e5d9a30a8f36/exec-c4f64129-4444-46d7-8189-03c25b39e6b2.png`
- implementation screenshot path: `C:/Users/kangy/AppData/Local/Temp/image-batch-desk-implementation.png`
- comparison composite path: `C:/Users/kangy/AppData/Local/Temp/image-batch-desk-comparison.png`
- viewport: `1488 x 1085` CSS px
- source pixel dimensions: `1488 x 1085`
- implementation pixel dimensions: `1488 x 1085`
- device scale factor: `1`
- density normalization: none required; source and implementation were captured at the same pixel dimensions
- state: authenticated local preview, 图片创作选项卡，6 个真实空闲任务，16:9 全局比例，批量提示词默认收起，无内部任务侧栏，无模拟图片结果

## Full-view comparison evidence

The combined comparison was reviewed side by side at the same viewport. The implementation now carries the selected Batch Desk structure: a compact white top bar, a dense global settings bar, and a three-column image-task grid that fills the available content area. Existing image-task controls remain data-driven; no placeholder result images or fake task states were introduced.

The source concept is a standalone workbench, while the implementation retains the existing authenticated host sidebar on the far left. This is an intentional scope boundary: only the 图片创作 page was restyled, while the shared host shell and the other creation pages remain intact.

## Focused-region comparison evidence

- Header and navigation: Batch Desk identity, image tab active state, compact control height, and readable top-right account controls were checked.
- Global toolbar: model, output count, ratio, resolution, quality, apply-all action, batch prompt disclosure, and estimate row were checked for alignment and wrapping.
- Task grid: first-row task cards were checked for three-column layout, compact parameter controls, prompt area, reference upload affordance, and output section separation.
- Responsive check: at `680 x 900`, the image content remains a single responsive column and document `scrollWidth` equals the viewport width (`665` CSS px after browser chrome), with no horizontal overflow.

## Findings

No actionable P0, P1, or P2 visual findings remain.

- Expected scope deviation: the existing authenticated host sidebar remains on the far left. It is intentionally preserved because the request limits the redesign to 图片创作 and asks other sections to remain unchanged.
- Expected state deviation: the source contains sample thumbnails and mixed task states; the implementation screenshot uses six real idle tasks with no results because the local preview must not add static or simulated product data.

## Comparison history

### Pass 1

- Finding: the bulk prompt was always expanded, pushing the task grid too far below the global controls and reducing the reference density.
- Severity: P2 density mismatch.
- Fix: changed the image-page bulk prompt into a closed-by-default `details` disclosure while keeping the existing textarea and synchronization handler available when opened.
- Post-fix evidence: `C:/Users/kangy/AppData/Local/Temp/image-batch-desk-comparison.png`.

### Pass 2

- Finding: the Batch Desk mark used a text glyph and could vary by font rendering.
- Severity: P3 polish.
- Fix: replaced the glyph with the existing `ImagePlus` icon component.
- Post-fix evidence: the same revised composite comparison and implementation screenshot listed above.
- Result: no actionable P0/P1/P2 differences remain.

## Primary interactions tested

- Added six tasks through the image-page Batch Desk “添加任务” action.
- Opened and collapsed “批量提示词”; the textarea remained available and visible when expanded.
- Changed the global ratio to `16:9` and clicked “应用到所有任务卡”; all task-card ratio controls updated to `16:9`.
- Switched to 视频创作、产品抠图、印花提取、商品套图; no image-only internal navigation column was rendered and the original page classes remained active.
- Checked the browser console for errors and warnings: none reported.

## Implementation Checklist

- [x] Image-only `creation-image` scope added.
- [x] Batch Desk header and image-only layout scope added only to 图片创作.
- [x] Compact global settings and three-column task grid added.
- [x] Existing image task state, references, parameters, generation, results, and actions preserved.
- [x] Bulk prompt remains available through a compact disclosure.
- [x] Desktop and mobile overflow checked.
- [x] Automated tests, production build, and `git diff --check` passed.

## Follow-up Polish

- P3: If the product later adopts the standalone Batch Desk shell globally, the host sidebar can be reconciled into one navigation layer. This is intentionally outside the current request.

### Pass 3

- Refinement: removed the image-only internal task navigation column (`新建任务 / 任务分组 / 文件夹`) at the user's request.
- Fix: changed the 图片创作 layout to a single main-content track, removed the retired sidebar markup and styles, and kept the shared outer navigation unchanged.
- Post-fix evidence: `C:/Users/kangy/AppData/Local/Temp/image-batch-desk-implementation.png`.

final result: passed
