// Git status domain: the change types, line parsers, badge formatter, and the
// read-only queries that produce them. Pure over the exec layer — no vscode.

import { execGit } from "./exec";

// One changed path. `status` is a 2-char code (porcelain v1, or synthesised
// from --name-status for bump rows). `sourcePath` is the HEAD-side path of a
// rename/copy — needed because `git show HEAD:<newPath>` fails (HEAD has the
// old path).
export interface FileStatus {
  status: string;
  file: string;
  sourcePath?: string;
}

// A submodule "bump": HEAD has advanced past the gitlink the superproject
// records, with no uncommitted files. The change to review is recorded..HEAD.
export interface BumpRef {
  baseRef: string; // recorded gitlink (range start)
  headRef: string; // submodule HEAD (range end)
  basePath: string; // path at baseRef (== file unless renamed in range)
}

// Status code → single-letter badge. "??" → "U"; for staged-only codes the
// first char wins, otherwise the worktree char.
export function statusBadge(s: string): string {
  const trimmed = s.trim();
  if (trimmed === "??") return "U";
  const first = trimmed.charAt(0);
  const second = trimmed.charAt(1);
  return first === " " ? second || "?" : first || "?";
}

// Parse a `git status --porcelain` line. Renames are "R  old -> new".
export function parseStatusLine(line: string): FileStatus {
  const status = line.slice(0, 2);
  const filePart = line.slice(3);
  const arrowIdx = filePart.indexOf(" -> ");
  if (arrowIdx >= 0) {
    return { status, sourcePath: filePart.slice(0, arrowIdx), file: filePart.slice(arrowIdx + 4) };
  }
  return { status, file: filePart };
}

// Parse a `git diff --name-status -M` line: "M\tfile", "R100\told\tnew", etc.
// Tab-separated, no leading space (unlike porcelain); normalised to a 2-char
// code so statusBadge() renders it like a working row.
export function parseNameStatusLine(line: string): FileStatus {
  const parts = line.split("\t");
  const letter = (parts[0] ?? "").charAt(0);
  if ((letter === "R" || letter === "C") && parts.length >= 3) {
    return { status: ` ${letter}`, sourcePath: parts[1] ?? "", file: parts[2] ?? "" };
  }
  return { status: ` ${letter}`, file: parts[1] ?? "" };
}

// Working-tree changes. --untracked-files=all expands untracked dirs to their
// files, matching VSCode's native SCM panel.
export async function getStatus(repoPath: string): Promise<FileStatus[]> {
  const out = await execGit(repoPath, ["status", "--porcelain", "--untracked-files=all"]);
  if (!out) return [];
  return out
    .split("\n")
    .filter((l) => l.length > 3)
    .map(parseStatusLine);
}

export async function getBranch(repoPath: string): Promise<string> {
  return (await execGit(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
}

export async function getHead(repoPath: string): Promise<string> {
  return (await execGit(repoPath, ["rev-parse", "HEAD"])).trim();
}

// SHA the superproject records for a submodule, from its HEAD tree. Empty if
// relPath isn't a gitlink (type "commit") there.
export async function getRecordedGitlink(aggregatorPath: string, relPath: string): Promise<string> {
  const out = await execGit(aggregatorPath, ["ls-tree", "HEAD", "--", relPath]);
  return out.match(/^\S+ commit (\S+)\t/)?.[1] ?? "";
}

// Files changed across a bump range — the contents of the bump.
export async function getBumpFiles(
  repoPath: string,
  base: string,
  head: string,
): Promise<FileStatus[]> {
  const out = await execGit(repoPath, ["diff", "--name-status", "-M", base, head]);
  if (!out) return [];
  return out
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map(parseNameStatusLine);
}
