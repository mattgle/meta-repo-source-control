// Refresh wiring: two sources (intent-aware VSCode events + a broad fs watcher
// for terminal/agent/external edits) deduped into one debounced refresh.

import * as vscode from "vscode";
import { TREE_REFRESH_DEBOUNCE_MS } from "../config";

// Ignore paths that change without affecting `git status`: our own HEAD-blob
// writes (.git/), dependency/build outputs, TS incremental state, OS cruft.
export function shouldIgnorePath(fsPath: string): boolean {
  const segmentDenylist = ["/.git/", "/node_modules/", "/dist/", "/out/", "/build/", "/coverage/"];
  if (segmentDenylist.some((s) => fsPath.includes(s))) return true;
  const extensionDenylist = [".tsbuildinfo", ".log", ".swp", ".swo"];
  if (extensionDenylist.some((ext) => fsPath.endsWith(ext))) return true;
  const basenameDenylist = [".DS_Store", "Thumbs.db"];
  return basenameDenylist.some((b) => fsPath.endsWith("/" + b));
}

export function registerWatchers(
  context: vscode.ExtensionContext,
  tree: vscode.TreeView<unknown>,
  refresh: () => void,
): void {
  let timer: NodeJS.Timeout | null = null;
  const schedule = (delay: number = TREE_REFRESH_DEBOUNCE_MS): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(refresh, delay);
  };
  const onExternal = (uri: vscode.Uri): void => {
    if (!shouldIgnorePath(uri.fsPath)) schedule();
  };
  const watcher = vscode.workspace.createFileSystemWatcher("**/*");

  context.subscriptions.push(
    // Intent-aware events — fast path for in-editor changes.
    vscode.workspace.onDidSaveTextDocument(() => schedule(150)),
    vscode.workspace.onDidCreateFiles(() => schedule(150)),
    vscode.workspace.onDidDeleteFiles(() => schedule(150)),
    vscode.workspace.onDidRenameFiles(() => schedule(150)),
    vscode.workspace.onDidChangeWorkspaceFolders(() => schedule(0)),
    // Refresh on re-entering the view, in case external ops happened while away.
    tree.onDidChangeVisibility((e) => {
      if (e.visible) schedule(0);
    }),
    // Broad watcher — catches terminal git, agents, other editors. Filtered to
    // avoid TS-daemon / build-output churn.
    watcher.onDidChange(onExternal),
    watcher.onDidCreate(onExternal),
    watcher.onDidDelete(onExternal),
    watcher,
  );
}
