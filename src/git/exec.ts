// Low-level git process layer. No vscode, no domain logic — just three ways to
// shell out to git.

import * as cp from "node:child_process";

// Read-only query. Swallows errors (returns "" on failure): for status/branch
// lookups a missing repo or path is simply "no output", not an exception.
export function execGit(repoPath: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    cp.execFile("git", ["-C", repoPath, ...args], { encoding: "utf8" }, (err, stdout) =>
      resolve(err ? "" : stdout),
    );
  });
}

// `git show <ref>:<path>` → contents, or "" if the path is absent at that ref
// (one side of an add/delete). A missing blob is a legitimate empty diff side.
export function showBlob(repoPath: string, ref: string, blobPath: string): Promise<string> {
  return new Promise((resolve) => {
    cp.execFile(
      "git",
      ["-C", repoPath, "show", `${ref}:${blobPath}`],
      { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
      (err, stdout) => resolve(err ? "" : stdout),
    );
  });
}

// Mutating command — surfaces stderr (execGit would swallow it), so
// checkout/reset/clean failures are reported rather than silently lost.
export function runGit(repoPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    cp.execFile("git", ["-C", repoPath, ...args], { encoding: "utf8" }, (err, _stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message));
      else resolve();
    });
  });
}
