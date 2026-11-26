---
name: security
base: security
---

- What this repository takes in and reaches: a command-line tool and library that reads a project's config and map files, a design snapshot and a built Storybook from disk, launches a browser (`playwright-core`) and, in `snapshot`, fetches a claude.ai design artifact. Paths from config or maps reach the filesystem; markup from Storybook and the canvas reaches parsers (`parse5`) and the browser.
- Where sensitive code lives: file paths and writes in the snapshot, picture and report commands (`src/*.ts`); network access and any token in the snapshot fetch; `.github/workflows/ci.yml` for the release and publish jobs (a package token, `packages: write`).
- BLOCKING: a path from config, a map or a canvas written or read outside the directories the command is given (traversal); a token or secret printed, written to the snapshot or committed; a workflow step that widens `permissions` or runs untrusted pull request input in a shell.

- What this reviewer owns beyond its base: the areas above. Correctness is the principal reviewer's.

- Fetch the base branch (`origin/main`) before judging the diff. Accepted findings are not raised again. When your prompt lists findings of the ticket a person decided accepted (with their ids), do not raise one again, not as BLOCKING or OPTIONAL and not with a verdict of open: Tick-it drops a verdict of open on an accepted finding when the run is recorded and leaves it out of your blocking count. A new finding with different text is still raised.
