// Repo discovery: find the git repos under a workspace folder. No vscode.

import * as fs from "node:fs";
import * as path from "node:path";
import { MAX_SCAN_DEPTH, SCAN_SKIP_DIRS } from "../config";

// Discover git repos under a workspace folder.
//
// The folder root is the *aggregator*: if it is itself a git repo (a
// superproject, or a linked worktree whose `.git` is a FILE), it is recorded
// AND descended into — so its nested submodules are still found. A naive
// "found .git, stop" scan would short-circuit on the root and never see them.
//
// Any nested dir containing `.git` (file or dir) is a leaf repo — recorded,
// not descended into. Dot-dirs and build outputs are skipped so the walk stays
// cheap (it stops at each repo and never enters one).
export async function discoverRepos(
  root: string,
): Promise<{ aggregator: string | null; subRepos: string[] }> {
  const subRepos: string[] = [];
  const aggregator = fs.existsSync(path.join(root, ".git")) ? root : null;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_SCAN_DEPTH) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith(".") || SCAN_SKIP_DIRS.has(e.name)) continue;
      const child = path.join(dir, e.name);
      if (fs.existsSync(path.join(child, ".git"))) subRepos.push(child);
      else await walk(child, depth + 1);
    }
  }

  await walk(root, 1);
  return { aggregator, subRepos };
}
