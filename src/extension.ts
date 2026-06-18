// Entry point — wiring only. Instantiate the provider, create the tree view,
// register the refresh watchers and the commands. All real logic lives in the
// git / model / tree / commands / watch layers.

import * as vscode from "vscode";
import { CMD, TMP_DIR_NAME, VIEW_ID } from "./config";
import { registerCommands } from "./commands/register";
import { parseStatusLine, statusBadge } from "./git/status";
import { WorkspaceChangesProvider } from "./tree/provider";
import { WorkspaceTreeItem } from "./tree/items";
import { registerWatchers, shouldIgnorePath } from "./watch/watcher";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new WorkspaceChangesProvider();
  const tree = vscode.window.createTreeView<WorkspaceTreeItem>(VIEW_ID, {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(tree);

  registerWatchers(context, tree, () => provider.refresh());
  registerCommands(context, provider, tree);
}

export function deactivate(): void {
  // All resources were registered via context.subscriptions — VSCode disposes
  // them automatically.
}

// Exported for unit tests; not part of the public extension surface.
export const __testing = {
  statusBadge,
  shouldIgnorePath,
  parseStatusLine,
  TMP_DIR_NAME,
  CMD,
  VIEW_ID,
};
