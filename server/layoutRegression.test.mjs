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
