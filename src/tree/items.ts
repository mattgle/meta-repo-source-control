// TreeItem subclasses — one per model level. They render the model; they hold
// no scanning logic.

import * as path from "node:path";
import * as vscode from "vscode";
import { CMD } from "../config";
import { BumpRef, statusBadge } from "../git/status";
import { FileChange, FolderModel, RepoModel } from "../model/scan";

// Level 0: a workspace folder root (a superproject or a worktree). Expanded so its
// submodules are visible at a glance.
export class FolderTreeItem extends vscode.TreeItem {
  constructor(public readonly model: FolderModel) {
    super(model.name, vscode.TreeItemCollapsibleState.Expanded);
    const count = model.ownChanges.length + model.repos.reduce((n, r) => n + r.changes.length, 0);
    this.id = `folder:${model.rootPath}`;
    this.description = model.branch;
    this.tooltip = `${model.rootPath}\n${model.branch || "(detached)"} · ${count} change${count === 1 ? "" : "s"}`;
    this.iconPath = new vscode.ThemeIcon("root-folder");
    this.contextValue = "folder";
  }
}

// Level 1 (under a folder): a dirty submodule. Collapsed by default so a
// worktree with many bumped submodules stays scannable.
export class RepoTreeItem extends vscode.TreeItem {
  readonly repoPath: string;
  readonly repoName: string;
  readonly changeCount: number;

  constructor(public readonly model: RepoModel) {
    super(model.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.repoPath = model.repoPath;
    this.repoName = model.name;
    this.changeCount = model.changes.length;
    const isBump = !!model.bump;
    this.id = `repo:${model.repoPath}`;
    this.description = isBump ? `↑ bump${model.branch ? ` · ${model.branch}` : ""}` : model.branch;
    this.tooltip =
      `${model.repoPath}\n${model.branch || "(detached)"} · ${this.changeCount} change${this.changeCount === 1 ? "" : "s"}` +
      (model.bump ? `\nbump ${model.bump.base.slice(0, 8)} → ${model.bump.head.slice(0, 8)}` : "");
    this.iconPath = new vscode.ThemeIcon(isBump ? "arrow-up" : "repo");
    this.contextValue = "repo";
  }
}

// Level 2 (leaf): a changed file. Working rows diff HEAD↔working; bump rows
// (committed range) carry their refs and diff the two committed blobs.
export class FileTreeItem extends vscode.TreeItem {
  readonly repoPath: string;
  readonly filePath: string;
  readonly gitStatus: string;
  readonly sourcePath?: string;
  readonly bump?: BumpRef;

  constructor(repoPath: string, change: FileChange) {
    super(path.basename(change.file), vscode.TreeItemCollapsibleState.None);
    this.repoPath = repoPath;
    this.filePath = change.file;
    this.gitStatus = change.status;
    this.sourcePath = change.sourcePath;
    this.bump = change.bump;

    const dir = path.dirname(change.file);
    // Distinct id prefix so a file that is BOTH a working change and in the
    // bump range yields two non-colliding rows.
    this.id = `${change.bump ? "bumpfile" : "file"}:${repoPath}:${change.file}`;
    this.description = dir === "." ? "" : dir;
    const renameNote = change.sourcePath ? `\nrenamed from ${change.sourcePath}` : "";
    const bumpNote = change.bump
      ? `\nbump ${change.bump.baseRef.slice(0, 8)} ↔ ${change.bump.headRef.slice(0, 8)}`
      : "";
    this.tooltip = `${change.file}\n${change.status.trim()} (${statusBadge(change.status)})${renameNote}${bumpNote}`;
    // resourceUri (and no iconPath) lets the active icon theme render the
    // file-type icon, same as Explorer.
    this.resourceUri = vscode.Uri.file(path.join(repoPath, change.file));
    // "bumpfile" (vs "file") suppresses the discard/open inline buttons — a
    // committed-range row has no working-tree change to discard.
    this.contextValue = change.bump ? "bumpfile" : "file";
    this.command = { command: CMD.openDiff, title: "Open Diff", arguments: [this] };
  }
}

export type WorkspaceTreeItem = FolderTreeItem | RepoTreeItem | FileTreeItem;
