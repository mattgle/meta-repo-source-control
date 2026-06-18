// Discard operations — destructive, each modal-confirmed before running.

import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { LOG_PREFIX } from "../config";
import { runGit } from "../git/exec";
import { FileTreeItem, RepoTreeItem } from "../tree/items";

// Discard one file — mirrors native SCM: untracked → delete from disk; rename
// → restore old + remove new atomically; tracked → checkout HEAD.
export async function discardChanges(item: FileTreeItem, refresh: () => void): Promise<void> {
  const fileName = path.basename(item.filePath);
  const isUntracked = item.gitStatus.includes("?");
  const isRename = !!item.sourcePath;

  const message = isUntracked
    ? `Are you sure you want to DELETE the following file?\n\n${fileName}\n\nThis is IRREVERSIBLE!`
    : isRename
      ? `Are you sure you want to undo this rename?\n\n${item.sourcePath} → ${item.filePath}\n\nThe new file will be removed and the original restored. This is IRREVERSIBLE!`
      : `Are you sure you want to discard changes in '${fileName}'?\n\nThis is IRREVERSIBLE!`;
  const confirmLabel = isUntracked ? "Delete File" : isRename ? "Undo Rename" : "Discard Changes";

  const choice = await vscode.window.showWarningMessage(message, { modal: true }, confirmLabel);
  if (choice !== confirmLabel) return;

  try {
    if (isUntracked) {
      await fs.promises.unlink(path.join(item.repoPath, item.filePath));
    } else if (isRename && item.sourcePath) {
      await runGit(item.repoPath, [
        "restore",
        "--source=HEAD",
        "--staged",
        "--worktree",
        "--",
        item.sourcePath,
        item.filePath,
      ]);
    } else {
      await runGit(item.repoPath, ["checkout", "HEAD", "--", item.filePath]);
    }
    refresh();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`${LOG_PREFIX}: discard failed for ${fileName}: ${msg}`);
  }
}

// Discard ALL changes in a repo: reset --hard + clean -fd (no -x, so ignored
// paths are preserved — matching the `??` rows the tree shows).
export async function discardAllChanges(item: RepoTreeItem, refresh: () => void): Promise<void> {
  const message =
    `Are you sure you want to DISCARD ALL CHANGES in '${item.repoName}'?\n\n` +
    `${item.changeCount} change${item.changeCount === 1 ? "" : "s"} will be discarded ` +
    `(modifications reset, untracked files deleted). Ignored paths are preserved.\n\nThis is IRREVERSIBLE!`;
  const confirmLabel = "Discard All Changes";

  const choice = await vscode.window.showWarningMessage(message, { modal: true }, confirmLabel);
  if (choice !== confirmLabel) return;

  try {
    await runGit(item.repoPath, ["reset", "--hard", "HEAD"]);
    await runGit(item.repoPath, ["clean", "-fd"]);
    refresh();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`${LOG_PREFIX}: discard all failed for ${item.repoName}: ${msg}`);
  }
}
