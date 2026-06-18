// Brand + tuning constants. Single source so the view id, command ids, temp
// dir, and scan limits never drift across modules.

export const VIEW_ID = "metarepoSc.changes";
export const LOG_PREFIX = "metarepo-sc";
export const TMP_DIR_NAME = "metarepo-sc-tmp";
export const TREE_REFRESH_DEBOUNCE_MS = 500;

// How deep to walk a workspace folder for nested git repos. Submodules under
// an aggregator sit a few levels down (e.g. `services/<repo>` is depth 2); 3
// covers grouped layouts without an unbounded crawl.
export const MAX_SCAN_DEPTH = 3;

// Directory names never worth descending into while hunting for repos.
export const SCAN_SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "out",
  "build",
  "coverage",
  "target",
  "vendor",
]);

export const CMD = {
  refresh: "metarepoSc.refresh",
  openDiff: "metarepoSc.openDiff",
  openFile: "metarepoSc.openFile",
  expandAll: "metarepoSc.expandAll",
  discardChanges: "metarepoSc.discardChanges",
  discardAllChanges: "metarepoSc.discardAllChanges",
} as const;
