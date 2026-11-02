# Drawing board: this project

The drawing-board skills read this file first. It holds what is particular to this project; the
skills hold the process. Keep it short, and keep it true.

## The canvas

- Artifact: <https://claude.ai/artifact/…>
- Owner (who gives the go-ahead on a design): <name or role>
- Tokens file on the canvas: `project/…/tokens.json`

## The snapshot

- Folder: `<path>` (one `.meta.json`, `.map.json` and copy per board, if the project has split it)
- Hand-kept files: `<path>` (map files, known-gap lists)
- Generated files, never edited by hand: `<path>`

## Commands

| Step | Command | Notes |
| --- | --- | --- |
| Refresh the boards you changed | `npm run design-canvas:snapshot -- --from <folder> --version <version> --boards A.dc.html,B.dc.html` | `--tokens` when the tokens changed. Say "full refresh only" here if `--boards` is not supported yet |
| Full refresh | `npm run design-canvas:snapshot -- --from <folder> --version <version>` | Catching up, or resolving a conflict |
| Check | `npm run design-canvas:check` | Also run by CI as: `<job>` |
| Rebuild the story index | `npm run design-canvas:index` | Or "none" |
| Compare a board with its story | `npm run design-canvas:compare` | Advisory |
| Make the picture | `<command>` | For `ux-picture` |
| Upload a picture | `<command>` | Or "attach with `gh --attach`" |

## Pages

| Page id | Flow it covers | Boards |
| --- | --- | --- |
| `<id>` | <one line: the journey, start to end> | `<Prefix>*` |

Prototype pages are named `<KEY>-<number>` (for example `NOK-123`), one per ticket, and are never
read into the snapshot.

## Stories

- Story files: `<glob>`
- Full-page story tag, if any: `<tag>`

## Reviews

- Design reviewer: `<agent or person>`, before the push
- Where a UX change's pictures go: <pull request body, a comment, the ticket>
