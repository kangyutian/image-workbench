import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("workbench sidebar omits retired navigation entries", async () => {
  const source = await readFile(new URL("../src/AuthenticatedApp.tsx", import.meta.url), "utf8");
  const sidebar = source.slice(source.indexOf("<aside className=\"app-sidebar\">"), source.indexOf("</aside>") + "</aside>".length);

  assert.doesNotMatch(sidebar, /素材库|任务记录|API Key|设置/);
  assert.doesNotMatch(sidebar, /sidebar-secondary/);
});
