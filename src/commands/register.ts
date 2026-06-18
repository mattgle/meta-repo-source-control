// Command registration — binds the contributed command ids to their handlers.

import * as path from "node:path";
import * as vscode from "vscode";
import { CMD, LOG_PREFIX } from "../config";
import { WorkspaceChangesProvider } from "../tree/provider";
import { FileTreeItem, RepoTreeItem, WorkspaceTreeItem } from "../tree/items";
import { openDiffForFile } from "./diff";
import { discardAllChanges, discardChanges } from "./discard";

export function registerCommands(
  context: vscode.ExtensionContext,
  provider: WorkspaceChangesProvider,
  tree: vscode.TreeView<WorkspaceTreeItem>,
): void {
  const refresh = (): void => provider.refresh();

  context.subscriptions.push(
    vscode.commands.registerCommand(CMD.refresh, refresh),

    vscode.commands.registerCommand(CMD.openDiff, async (item: unknown) => {
      if (!(item instanceof FileTreeItem)) return;
      await openDiffForFile(item.repoPath, item.filePath, item.gitStatus, item.sourcePath, item.bump);
    }),

    vscode.commands.registerCommand(CMD.openFile, async (item: unknown) => {
      if (!(item instanceof FileTreeItem)) return;
      const target = vscode.Uri.file(path.join(item.repoPath, item.filePath));
      await vscode.commands.executeCommand("vscode.open", target, { preview: false });
    }),

    // Expand-all: VSCode has built-in collapse-all but no expand-all. Reveal
    // each folder with expand depth 2 (folder → submodules → files).
    vscode.commands.registerCommand(CMD.expandAll, async () => {
      let folders = provider.getCurrentFolders();
      if (folders.length === 0) {
        await provider.getChildren();
        folders = provider.getCurrentFolders();
      }
      for (const folder of folders) {
        try {
          await tree.reveal(folder, { expand: 2, select: false, focus: false });
        } catch (err) {
          console.error(`${LOG_PREFIX}: expandAll reveal failed`, err);
        }
      }
    }),

    vscode.commands.registerCommand(CMD.discardChanges, async (item: unknown) => {
      if (item instanceof FileTreeItem) await discardChanges(item, refresh);
    }),

    vscode.commands.registerCommand(CMD.discardAllChanges, async (item: unknown) => {
      if (item instanceof RepoTreeItem) await discardAllChanges(item, refresh);
    }),
  );
}
