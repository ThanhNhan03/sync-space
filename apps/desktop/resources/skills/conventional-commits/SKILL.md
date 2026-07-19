---
name: conventional-commits
description: Write a well-formed Conventional Commits message and create the commit. Use this when the user asks to commit staged/current changes, write a commit message, or follow a commit convention.
---

# Conventional Commits

Follow this workflow to craft and create a high-quality commit for the current changes.

## 1. Inspect what changed

Use the git tools (or `execute_terminal`) to understand the change before writing anything:

- `git_status` to see staged vs. unstaged files.
- `git_diff` to read the actual staged changes.

Never invent a message from the request alone — base it on the real diff.

## 2. Compose the message

Format: `type(scope): subject`

- **type** — one of: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- **scope** — optional, the area touched (e.g. `auth`, `parser`). Omit if it spans many areas.
- **subject** — imperative mood, lower-case, no trailing period, ≤ 72 characters.

Add a body (blank line after the subject) only when the change needs explanation — what and why, not how. For a breaking change, add a `BREAKING CHANGE:` footer.

### Examples

```
feat(chat): stream tool results incrementally
fix: prevent crash when the workspace path contains spaces
docs: document the MCP settings flow
```

## 3. Create the commit

Only commit files the user intended. If nothing is staged, stage the relevant files first (confirm with the user when it's ambiguous), then commit with your composed message via `execute_terminal`.

After committing, report the commit subject and the files included.
