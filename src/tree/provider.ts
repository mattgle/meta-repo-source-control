// The TreeDataProvider: maps the scanned model to a three-level tree
// (folder → submodule → file), with the aggregator's own files shown directly
// under the folder. Holds parent pointers so tree.reveal()/expand-all work.

import * as vscode from "vscode";
import { scanWorkspace } from "../model/scan";
import { FileTreeItem, FolderTreeItem, RepoTreeItem, WorkspaceTreeItem } from "./items";

export class WorkspaceChangesProvider implements vscode.TreeDataProvider<WorkspaceTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<WorkspaceTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  // Parent pointers, set as children are produced — getParent() reads them.
  private readonly _parents = new WeakMap<WorkspaceTreeItem, WorkspaceTreeItem>();
  // Last top-level folders, for expand-all without a re-scan.
  private _folders: FolderTreeItem[] = [];

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: WorkspaceTreeItem): vscode.TreeItem {
    return element;
  }

  // Required for tree.reveal() to function. Folders are roots → null.
  getParent(element: WorkspaceTreeItem): WorkspaceTreeItem | null {
    return this._parents.get(element) ?? null;
  }

  getCurrentFolders(): FolderTreeItem[] {
    return this._folders;
  }

  async getChildren(element?: WorkspaceTreeItem): Promise<WorkspaceTreeItem[]> {
    if (!element) {
      const folders = vscode.workspace.workspaceFolders ?? [];
      const models = await scanWorkspace(
        folders.map((f) => ({ name: f.name, fsPath: f.uri.fsPath })),
      );
      this._folders = models.map((m) => new FolderTreeItem(m));
      return this._folders;
    }

    if (element instanceof FolderTreeItem) {
      const m = element.model;
      const kids: WorkspaceTreeItem[] = [];
      // The aggregator's own changed files, directly under the folder.
      if (m.aggregatorPath) {
        const agg = m.aggregatorPath;
        for (const c of m.ownChanges) kids.push(this._child(new FileTreeItem(agg, c), element));
      }
      // Each dirty submodule, nested under the folder.
      for (const r of m.repos) kids.push(this._child(new RepoTreeItem(r), element));
      return kids;
    }

    if (element instanceof RepoTreeItem) {
      return element.model.changes.map((c) =>
        this._child(new FileTreeItem(element.model.repoPath, c), element),
      );
    }

    return [];
  }

  private _child<T extends WorkspaceTreeItem>(item: T, parent: WorkspaceTreeItem): T {
    this._parents.set(item, parent);
    return item;
  }
}
