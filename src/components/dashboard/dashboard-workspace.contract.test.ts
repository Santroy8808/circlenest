import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const workspaceSource = readFileSync(resolve(process.cwd(), "src/components/dashboard/dashboard-workspace.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

test("dashboard widget placement uses the themed picker instead of a native select", () => {
  assert.match(workspaceSource, /dashboard-widget-picker-menu/);
  assert.doesNotMatch(workspaceSource, /dashboard-widget-replace select/);
  assert.match(styles, /\.dashboard-widget-picker-menu\s*\{[\s\S]*background: var\(--panel\)/);
  assert.match(styles, /\.dashboard-widget-picker-menu button\s*\{[\s\S]*color: var\(--text\)/);
});

test("dashboard row hover uses theme colors instead of a dark-only background", () => {
  assert.match(styles, /\.dashboard-widget-row:hover,[\s\S]*background: color-mix\(in srgb, var\(--gold\) 8%, var\(--panel-soft\)\)/);
  assert.doesNotMatch(styles, /\.dashboard-widget-row:hover,[\s\S]*background: rgba\(23, 33, 51, 0\.9\)/);
});
