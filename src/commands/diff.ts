// Diff opening — invoked when a file row is clicked.

import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { TMP_DIR_NAME } from "../config";
import { showBlob } from "../git/exec";
import { BumpRef } from "../git/status";

const SHOW = { preserveFocus: false, preview: true };

// HEAD blobs are materialised under <repo>/.git/<TMP_DIR_NAME>/ so VSCode's
// default `**/.git` exclusion keeps them out of Explorer/search/TS service.
function tmp(repoPath: string, ...segments: string[]): string {
  return path.join(repoPath, ".git", TMP_DIR_NAME, ...segments);
}

async function materialise(repoPath: string, ref: string, blobPath: string, dest: string): Promise<void> {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, await showBlob(repoPath, ref, blobPath));
}

// Bump rows diff the two COMMITTED blobs (recorded gitlink ↔ HEAD); working
// rows diff HEAD ↔ working tree; untracked rows just open the file.
export async function openDiffForFile(
  repoPath: string,
  file: string,
  status: string,
  sourcePath?: string,
  bump?: BumpRef,
): Promise<void> {
  if (bump) {
    const baseTmp = tmp(repoPath, "bump-base", file);
    const headTmp = tmp(repoPath, "bump-head", file);
    await materialise(repoPath, bump.baseRef, bump.basePath || file, baseTmp);
    await materialise(repoPath, bump.headRef, file, headTmp);
    const title = `${path.basename(file)} (bump ${bump.baseRef.slice(0, 8)} ↔ ${bump.headRef.slice(0, 8)})`;
    await vscode.commands.executeCommand(
      "vscode.diff",
      vscode.Uri.file(baseTmp),
      vscode.Uri.file(headTmp),
      title,
      SHOW,
    );
    return;
  }

  const target = path.join(repoPath, file);
  if (status.includes("?")) {
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) return;
    await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(target), SHOW);
    return;
  }

  // For renames HEAD knows the OLD path (sourcePath); look up the blob there.
  const headTmp = tmp(repoPath, file);
  await materialise(repoPath, "HEAD", sourcePath ?? file, headTmp);

  const fileName = path.basename(file);
  const sourceName = sourcePath ? path.basename(sourcePath) : null;
  const title =
    sourceName && sourceName !== fileName
      ? `${sourceName} → ${fileName} (HEAD ↔ Working)`
      : `${fileName} (HEAD ↔ Working)`;
  await vscode.commands.executeCommand(
    "vscode.diff",
    vscode.Uri.file(headTmp),
    vscode.Uri.file(target),
    title,
    SHOW,
  );
}
