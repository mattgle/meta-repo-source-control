# Meta-Repo Source Control

A VSCode extension for **multi-repo / meta-repo workspaces** — directories that contain many independent git checkouts side-by-side instead of one monorepo.

Contributes a clean **Workspace Changes** tree to the Source Control sidebar that lists _only repos with uncommitted changes_, expandable to their changed files. No per-repo commit input boxes. No empty-repo clutter. Click a file to open its diff.

---

## Why this exists

VSCode's native Source Control panel was designed for monorepos: one workspace, one git repo, one commit input. When the workspace contains _many_ git repos as siblings (a meta-repo pattern common in microservice shops, ROS workspaces, and similar layouts), the native panel renders one full SCM provider per repo — including the commit message input box, Commit button, and changes list, _for every repo_ — even repos with no changes. With twenty sibling repos, that's twenty commit boxes stacked vertically.

There's no native VSCode setting to hide repos with no changes (open feature request: [microsoft/vscode#33334](https://github.com/microsoft/vscode/issues/33334), unimplemented since 2017) and no setting to hide the commit input. Extensions cannot modify the native SCM panel because VSCode's renderer DOM is not part of the extension API surface.

This extension's solution: contribute a **separate tree view** that does what the native panel won't — show only dirty repos, no commit clutter, real file-type icons, click-to-diff. The native panel can stay collapsed.

---

## Features

- **Auto-discovers git repos** as immediate subdirectories of any open workspace folder (also handles single-repo workspaces).
- **Hides repos with no changes** — empty repos are skipped, not just sorted to the bottom.
- **Per-file rows** with the user's icon theme (Material Icon Theme, etc.) — same icons as Explorer.
- **Expand/Collapse all** buttons in the view header (collapse is built-in; expand walks repos and reveals).
- **Refresh button** for manual re-scan after terminal-side git operations.
- **Click a file → diff opens** in VSCode's diff editor (working tree vs HEAD), _focusing the diff_ so you can edit immediately.
- **Discard Changes** inline button on each file row, with a modal confirmation. Tracked files: `git checkout HEAD -- <file>`. Untracked files: deletes from disk.
- **Auto-refreshes on external edits** — when an external tool (terminal git, AI agents like Claude Code, other editors) modifies a file in the workspace, the view updates within ~500 ms automatically. No need to click refresh.
- **Stable item IDs** so VSCode preserves expansion state across refreshes (collapsing one repo doesn't re-expand on save).

---

## Install

```bash
code --install-extension mattgle.metarepo-sc
```

Or search for **"Meta-Repo Source Control"** in the Extensions sidebar.

The extension activates automatically when VSCode finishes starting. The only runtime requirement is `git` on `PATH` (which you already have, since you're using a git workspace).

---

## Devcontainer setup

To make the extension load automatically in a devcontainer, add it to `.devcontainer/devcontainer.json`:

```jsonc
{
  "customizations": {
    "vscode": {
      "extensions": ["mattgle.metarepo-sc"],
    },
  },
}
```

When the container is built, VSCode auto-installs the extension. **No Dockerfile changes are needed** — the extension has no native dependencies beyond `git`, which every common base image already has (`mcr.microsoft.com/devcontainers/*`, `ubuntu`, `debian`, `alpine` with `apk add git`, etc.).

If your base image somehow doesn't have git, add it to your Dockerfile:

```dockerfile
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
```

That's the full devcontainer setup. After rebuild, open the **Source Control** sidebar (`⌘+⇧+G G` / `Ctrl+Shift+G G`) — the **WORKSPACE CHANGES** section appears alongside the native Source Control list.

---

## Usage

After install + reload, open the **Source Control** sidebar (`⌘+⇧+G G`). You'll see a new section titled **WORKSPACE CHANGES** above (or below) the native Source Control list.

```
WORKSPACE CHANGES                          ⟳  ⊞  ⊟
─────────────────────────────────────
▼ auth-service                                  main
   routes.ts  src                                 M
▼ payments-api                          feat/refunds
   handler.ts  src                                M
   config.json  src                               U
```

- **Header buttons**: ⟳ Refresh, ⊞ Expand All, ⊟ Collapse All.
- **Per-file inline buttons**: 📄 Open File (no diff), ↩ Discard Changes.
- **Click a file row** → opens the diff editor.
- **Status decorations** (M / U / A / D, plus colored text) come from VSCode's git extension applying its FileDecorationProvider to our `resourceUri` — no extra wiring needed.

### Optional: avoid diff tab buildup

By default, every file you click opens its diff in a new editor tab. After clicking through 20 files in the tree, you'll have 20 diff tabs piled up. **Most users find this fine** — you can switch between them, close ones you've reviewed, etc.

If you'd rather have a "click-through" workflow where each new diff replaces the previous one (so the editor pane stays at one diff at a time), VSCode has built-in settings for that. Add to your user `settings.json` (`⌘+⇧+P` → `Preferences: Open User Settings (JSON)`):

```jsonc
{
  // Auto-close older diff tabs as you click through files in the tree
  // view — keeps the editor pane to one diff at a time.
  "workbench.editor.limit.enabled": true,
  "workbench.editor.limit.value": 1,
  "workbench.editor.limit.perEditorGroup": false,
}
```

Or, to apply this only inside a specific devcontainer (without affecting your global VSCode), add it under `customizations.vscode.settings` in `.devcontainer/devcontainer.json`.

These settings are **not part of the extension** — they're VSCode core, and the same settings affect any other tab-opening flow (clicking files in Explorer, going-to-definition, etc.). Try them and see if you like the behavior; if not, just remove them.

---

## Architecture

A small, layered TypeScript codebase bundled to ~11 KB with esbuild. Dependencies flow one way — `config ← git ← model ← tree / commands ← extension` — and the `git` and `model` layers never import `vscode`, so they're unit-testable in isolation.

```
src/
├── config.ts          brand + tuning constants (view id, command ids, scan depth)
├── extension.ts       activate(): wiring only — provider, tree view, watchers, commands
├── git/
│   ├── exec.ts        execGit / showBlob / runGit — the process layer
│   ├── status.ts      FileStatus + BumpRef types, line parsers, status/branch/bump queries
│   └── discover.ts    discoverRepos() — aggregator-aware repo walk
├── model/
│   └── scan.ts        scanWorkspace() → nested Folder → Repo → FileChange model (no vscode)
├── tree/
│   ├── items.ts       Folder / Repo / File TreeItem subclasses
│   └── provider.ts    WorkspaceChangesProvider — maps the model to a 3-level tree
├── commands/
│   ├── diff.ts        openDiffForFile() — working-tree and bump (committed-blob) diffs
│   ├── discard.ts     discardChanges / discardAllChanges
│   └── register.ts    binds command ids to handlers
└── watch/
    └── watcher.ts     shouldIgnorePath() + debounced refresh wiring
```

**Aggregator / superproject support.** Beyond flat side-by-side meta-repos, the extension also handles git submodules nested under a parent repo (including linked worktrees whose `.git` is a file):

- **Aggregator-aware discovery** — the workspace-folder root is treated as an aggregator (recorded _and_ descended into), and nested repos are found as leaves at any depth, instead of short-circuiting on the root's own `.git`.
- **Nested tree** — submodules render _under_ their folder root, with the aggregator's own files directly beneath it; gitlink "pointer" rows are filtered.
- **Bump rows** — a submodule whose HEAD is ahead of the recorded gitlink (committed work, clean worktree) surfaces as a `↑ bump` node, expandable to the files changed across `recorded..HEAD`, click-to-diff on the committed blobs.

Key technical decisions:

- **Parallel git status** via `Promise.all` — listing dozens of repos sequentially shows a loading bar; parallel is ~the slowest single repo.
- **Two-source refresh** — VSCode-internal events (`onDidSaveTextDocument`, `onDidCreateFiles`, etc.) fire fast for in-editor saves; a broad `createFileSystemWatcher('**/*')` catches changes from external tools (terminal git, AI agents, other editors). `shouldIgnorePath()` filters out `.git/` internals, `node_modules/`, build outputs, `*.tsbuildinfo`, and OS metadata to prevent refresh churn. Both paths feed a single 500 ms debounced refresh.
- **Stable TreeItem IDs** (`folder:<path>`, `repo:<path>`, `file:<repo>:<file>`) — required for `tree.reveal()` to work and for VSCode to preserve expansion state across refreshes.
- **`getParent()` via parent pointers** — required for `tree.reveal()` / expand-all to function; without it, expand-all silently no-ops.
- **HEAD blobs in `<repo>/.git/metarepo-sc-tmp/`** — VSCode's default `**/.git` exclusion automatically hides them from Explorer, search, and the TypeScript language service. Filename matches the working file so diff tab titles are clean.
- **Untracked directory short-circuit** — `git status --porcelain --untracked-files=all` expands directories to their files, but the click handler still defends against directory targets in case any slip through (e.g. submodules).

---

## Troubleshooting

| Symptom                                   | Cause                                                            | Fix                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Tree view doesn't appear after install    | Reload didn't happen                                             | `⌘+⇧+P` → Developer: Reload Window                                             |
| Tree shows but Workspace Changes is empty | Workspace folder isn't a meta-repo _and_ isn't a single git repo | Open VSCode rooted at the meta-repo directory                                  |
| Diff doesn't open when clicking a file    | Check the extension host console for errors                      | `⌘+⇧+P` → Developer: Toggle Developer Tools → Console; filter by `metarepo-sc` |
| View doesn't refresh after external edits | Broad watcher disabled or the path matches the ignore filter     | Check that the path isn't under `.git/`, `node_modules/`, `dist/`, etc.        |
| Discard accidentally wiped changes        | Confirmation dismissed too quickly                               | None — destructive operations are designed to be confirmed once and committed  |

---

## Contributing

This extension lives in [`mattgle/meta-repo-source-control`](https://github.com/mattgle/meta-repo-source-control). See [CONTRIBUTING.md](https://github.com/mattgle/meta-repo-source-control/blob/main/CONTRIBUTING.md) for setup, build/test commands, and PR guidelines.

## License

[MIT](https://github.com/mattgle/meta-repo-source-control/blob/main/LICENSE)
