# Drawing board: this project

The drawing-board skills read this file first. It holds what is particular to this project; the
skills hold the process. Keep it short, and keep it true.

## The canvas

- Artifact: <https://claude.ai/artifact/…>
- Owner (who gives the go-ahead on a design): <name or role>
- Tokens file on the canvas: `project/…/tokens.json`

## The snapshot

- Folder: `<path>` (the convention is `design/canvas`; anything else is `snapshot` in `.drawing-board`)
- Written by `drawing-board snapshot`, never by hand: `boards/<Board>.meta.json`, the copies
  `boards/<Board>.dc.html`, `boards/support.js`, `tokens.json`, `story-index.json`, `artifact.json`
- Kept by hand: `boards/<Board>.map.json` (the story, or why there is none) and
  `unpublished-known.json` (shrink only)

## Commands

Every command is the `@tinkerbench-studio/drawing-board` package's, working by convention;
`.drawing-board` holds only this project's differences (the drawing-board README lists the
conventions). Say how this project runs it (a pinned `npx` script from the public git tag, which needs
no token, or a dev dependency from GitHub Packages, which does: the README says which suits); with the
pinned script, the commands below are
`npm run drawing-board -- <command>`. What only this project can supply (extra checks, its pages for
`page-shots`) is in its hook module: `<path>`, or "none".

| Step | Command | Notes |
| --- | --- | --- |
| Refresh the boards you changed | `npx drawing-board snapshot --from <folder> --version <version> --boards A.dc.html,B.dc.html` | `--tokens` when the tokens changed |
| Full refresh | `npx drawing-board snapshot --from <folder> --version <version>` | Catching up, or resolving a conflict |
| Check | `npx drawing-board check` | The package's checks and the project's `checks()`. Also run by CI as: `<job>` |
| Rebuild the story index | `npx drawing-board index` | After editing a map file's `story`, or merging one |
| Boards with no story, stories with no board | `npx drawing-board report` | |
| Compare each board with its story | `npx drawing-board compare` | Advisory; needs a built Storybook |
| The board-beside-story picture | `npx drawing-board board-shot --board <Board>.dc.html` | For `ux-picture`: banners, numbered boxes, the table |
| The pages' pictures | `npx drawing-board page-shots` | From the hook's `pages()`; or "none" |
| A story's pictures | `npx drawing-board story-shot <storybook-static-dir> <story-id> <out.png>` | `--list` for the ids |
| Before and after, changes outlined | `npx drawing-board compare-pictures <before-dir> <after-dir> <out-dir>` | Pairs pictures by name |
| Upload a picture | `<command>` | The project's own, or "attach with `gh --attach`" |

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
