# Drawing board: this project

The drawing-board skills read this file first. It holds what is particular to this project; the
skills hold the process. Keep it short, and keep it true.

## The canvas

- Artifact: <https://claude.ai/artifact/…>
- Owner (who gives the go-ahead on a design): <name or role>
- Tokens file on the canvas: `project/…/tokens.json`

## The snapshot

- Folder: `<path>`, as `snapshot` in `drawing-board.config.json`
- Written by `drawing-board snapshot`, never by hand: `boards/<Board>.meta.json`, the copies
  `boards/<Board>.dc.html`, `boards/support.js`, `tokens.json`, `story-index.json`, `artifact.json`
- Kept by hand: `boards/<Board>.map.json` (the story, or why there is none) and
  `unpublished-known.json` (shrink only)

## Commands

The snapshot commands come from the `@tinkerbench-studio/drawing-board` package on GitHub Packages,
configured by `drawing-board.config.json` at the project's root. Say how this project installs it (a
dev dependency, or a pinned `npx` script: the drawing-board README compares them) and where its
token comes from; with the pinned script, the commands below are `npm run drawing-board -- <command>`.

| Step | Command | Notes |
| --- | --- | --- |
| Refresh the boards you changed | `npx drawing-board snapshot --from <folder> --version <version> --boards A.dc.html,B.dc.html` | `--tokens` when the tokens changed |
| Full refresh | `npx drawing-board snapshot --from <folder> --version <version>` | Catching up, or resolving a conflict |
| Check | `npx drawing-board check` | Also run by CI as: `<job>` |
| Rebuild the story index | `npx drawing-board index` | After editing a map file's `story`, or merging one |
| Boards with no story, stories with no board | `npx drawing-board report` | |
| Compare a board with its story | `<command>` | Advisory. The project's own command, which draws each story its own way and passes the markup to the package's `comparePages` |
| A story's pictures (dark, light, phone) | `npx drawing-board story-shot <storybook-static-dir> <story-id> <out.png>` | Needs `playwright-core` and a Chromium; `--list` for the ids |
| Before and after, changes outlined | `npx drawing-board compare-pictures <before-dir> <after-dir> <out-dir>` | Pairs pictures by name |
| Make the board-beside-story picture | `<command>` | For `ux-picture`; the project's own |
| Upload a picture | `<command>` | Or "attach with `gh --attach`" |

## Pages

| Page id | Flow it covers | Boards |
| --- | --- | --- |
| `<id>` | <one line: the journey, start to end> | `<Prefix>*` |

Prototype pages are named `<KEY>-<number>` (for example `NOK-123`), one per ticket, and are never
read into the snapshot. (If the snapshot cannot skip those yet, name the one prototype page to use
instead, and the ticket that will change it.)

## Stories

- Story files: `<glob>`
- Full-page story tag, if any: `<tag>`

## Reviews

- Design reviewer: `<agent or person>`, before the push
- Where a UX change's pictures go: <pull request body, a comment, the ticket>
