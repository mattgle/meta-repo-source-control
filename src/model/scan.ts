// Workspace model: scan the open folders into a nested tree of
// Folder → Repo → FileChange. Pure over the git layer (no vscode), so the
// nesting shape and bump detection are testable on their own.

import * as path from "node:path";
import { discoverRepos } from "../git/discover";
import {
  BumpRef,
  FileStatus,
  getBranch,
  getBumpFiles,
  getHead,
  getRecordedGitlink,
  getStatus,
} from "../git/status";

// A change row — everything the view needs to render and diff it.
export interface FileChange {
  status: string;
  file: string;
  sourcePath?: string;
  bump?: BumpRef; // set => committed-range (bump) change, not a working edit
}

// A dirty submodule beneath a folder root.
export interface RepoModel {
  name: string; // path relative to the folder root, e.g. "services/api"
  repoPath: string;
  branch: string;
  bump?: { base: string; head: string };
  changes: FileChange[];
}

// A workspace folder root and everything dirty beneath it.
export interface FolderModel {
  name: string; // the workspace folder's display name (may carry an emoji)
  rootPath: string;
  aggregatorPath: string | null; // the root repo, if the folder is itself one
  branch: string;
  ownChanges: FileChange[]; // the aggregator's own files (gitlink rows filtered out)
  repos: RepoModel[]; // dirty submodules, sorted by name
}

export interface WorkspaceFolderInput {
  name: string;
  fsPath: string;
}

function toChange(s: FileStatus): FileChange {
  return { status: s.status, file: s.file, sourcePath: s.sourcePath };
}

// Build one submodule's model: working-tree changes plus, if its HEAD is ahead
// of the recorded gitlink, the bump's files (each carrying the recorded..HEAD
// refs so the view can diff the committed blobs). Git calls run sequentially to
// bound peak concurrency to the number of submodules, not a multiple of it.
async function scanRepo(root: string, sub: string, aggregator: string | null): Promise<RepoModel> {
  const name = path.relative(root, sub);
  const working = await getStatus(sub);
  const recorded = aggregator ? await getRecordedGitlink(aggregator, name) : "";
  const head = await getHead(sub);
  const branch = await getBranch(sub);
  const isBump = !!recorded && !!head && recorded !== head;
  const bumpFiles = isBump ? await getBumpFiles(sub, recorded, head) : [];

  const changes: FileChange[] = [
    ...working.map(toChange),
    ...bumpFiles.map((s) => ({
      status: s.status,
      file: s.file,
      sourcePath: s.sourcePath,
      bump: { baseRef: recorded, headRef: head, basePath: s.sourcePath ?? s.file },
    })),
  ];

  return { name, repoPath: sub, branch, bump: isBump ? { base: recorded, head } : undefined, changes };
}

// Build one folder's model: the aggregator's own changes (gitlink "pointer"
// rows filtered, since each changed submodule is its own node) plus a node per
// dirty submodule. Returns null if nothing is dirty.
async function scanFolder(folder: WorkspaceFolderInput): Promise<FolderModel | null> {
  const root = folder.fsPath;
  const { aggregator, subRepos } = await discoverRepos(root);
  const subRel = new Set(subRepos.map((p) => path.relative(root, p)));

  let ownChanges: FileChange[] = [];
  if (aggregator) {
    const status = await getStatus(aggregator);
    ownChanges = status.filter((s) => !subRel.has(s.file)).map(toChange);
  }

  const repos = (await Promise.all(subRepos.map((sub) => scanRepo(root, sub, aggregator))))
    .filter((r) => r.changes.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (ownChanges.length === 0 && repos.length === 0) return null;

  const branch = aggregator ? await getBranch(aggregator) : "";
  return { name: folder.name, rootPath: root, aggregatorPath: aggregator, branch, ownChanges, repos };
}

// Scan all workspace folders in parallel; keep only those with changes.
export async function scanWorkspace(folders: WorkspaceFolderInput[]): Promise<FolderModel[]> {
  const models = await Promise.all(folders.map(scanFolder));
  return models.filter((m): m is FolderModel => m !== null);
}
