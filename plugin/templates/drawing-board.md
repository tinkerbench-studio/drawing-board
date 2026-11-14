# Drawing board: this project

The drawing-board skills read this file first. It holds what is particular to this project; the
skills hold the process. Keep it short, and keep it true.

## Canvases

| Id | Role | Link | What it holds |
| --- | --- | --- | --- |
| `main` | main | <https://claude.ai/artifact/…> | The designs that are built, and the source of truth after they are built |
| `<id>` | prototypes | <https://claude.ai/artifact/…> | Designs under way, a page per ticket (or delete this row) |
| `<id>` | reference | <https://claude.ai/artifact/…> | Boards that are not app screens (or delete this row) |

A project with one canvas keeps only the `main` row; its link may be the top-level `artifact` in
`drawing-board.config.json`. With more, each is in its `canvases` setting, with its own snapshot
where it has one.

- Owner (who gives the go-ahead on a design): <name or role>
- Tokens file on the canvas: `project/…/tokens.json`
- Design system installed on each canvas, if any: `<namespace>` at version `<version>` (the
  `designSystems` setting), from <https://claude.ai/artifact/…>

## The snapshot

- Folder: `<path>` (the convention is `design/canvas`; anything else is `snapshot` in `drawing-board.config.json`)
  and, for a reference canvas with one, `<path>`
- Written by `drawing-board snapshot`, never by hand: `boards/<Board>.meta.json`, the copies
  `boards/<Board>.dc.html`, `boards/support.js`, `tokens.json`, `story-index.json`, and
  `artifact.json` (the record: canvas, version, file count, boards, design systems)
- Kept by hand: `boards/<Board>.map.json` (the story, or why there is none, and `tags`),
  `pages.json` (below) and `unpublished-known.json` (shrink only)

## Commands

Every command is the `@tinkerbench-studio/drawing-board` package's, working by convention;
`drawing-board.config.json` (the earlier name `.drawing-board` is still read) holds only this project's differences (the drawing-board README lists the
conventions). Say how this project installs it from GitHub Packages (a pinned `npx` script or a dev
dependency: the README compares them) and where its token comes from; with the
pinned script, the commands below are
`npm run drawing-board -- <command>`. What only this project can supply (extra checks, its pages for
`page-shots`) is in its hook module: `<path>`, or "none".

| Step | Command | Notes |
| --- | --- | --- |
| Refresh the boards you changed | `npx drawing-board snapshot --from <folder> --version <version> --boards A.dc.html,B.dc.html` | `--tokens` when the tokens changed; `--canvas <id>` for a canvas other than main |
| Full refresh | `npx drawing-board snapshot --from <folder> --version <version>` | Catching up, or resolving a conflict |
| Check | `npx drawing-board check` | The package's checks on every snapshot and the project's `checks()`, then the files in use and any warnings. Also run by CI as: `<job>` |
| What changed on the canvas | `npx drawing-board status --from <folder>` | Before a refresh; writes nothing. Gives the files the canvas holds now |
| Find a board | `npx drawing-board find <words…>` | By name, page, flow, keywords, story and tags |
| Rebuild the story index | `npx drawing-board index` | After editing a map file's `story`, or merging one |
| Boards with no story, stories with no board | `npx drawing-board report` | |
| Compare each board with its story | `npx drawing-board compare` | Advisory; needs a built Storybook |
| The board-beside-story picture | `npx drawing-board annotate --board <Board>.dc.html` | For `ux-picture`: banners, numbered boxes, the table |
| The pages' pictures | `npx drawing-board page-shots` | From the hook's `pages()`; or "none" |
| A story's pictures | `npx drawing-board story-shot <storybook-static-dir> <story-id> <out.png>` | `--list` for the ids |
| Before and after, changes outlined | `npx drawing-board compare-pictures <before-dir> <after-dir> <out-dir>` | Pairs pictures by name |
| Upload a picture | `<command>` | The project's own, or "attach with `gh --attach`" |

## Pages

The pages are in `<snapshot>/pages.json`, each with its `flow` (one line: the journey, start to end),
its board name `prefixes` and the `keywords` a ticket about it uses. `drawing-board check` holds each
board to them. Keep that file, not a table here.

Prototype pages are named `<KEY>-<number>` (for example `NOK-123`), one per ticket, and are never
read into the snapshot. They go on the prototypes canvas when the project has one, else on the main
canvas. (If the snapshot cannot skip those yet, name the one prototype page to use
instead, and the ticket that will change it.)

## Stories

- Story files: `<glob>`
- Full-page story tag, if any: `<tag>`

## Traps

- A canvas holds at most 512 files of its own (boards, `canvas.json`, tokens, design system files).
  A publish over that is refused. `drawing-board check` says how many are free; check before
  publishing a design (about four files).
- <anything else this project has learnt the hard way>

## Reviews

- Design reviewer: `<agent or person>`, before the push
- Where a UX change's pictures go: <pull request body, a comment, the ticket>
