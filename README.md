# drawing-board

The design workflows for any project that keeps its designs on a design canvas (a claude.ai Design
artifact) and builds them in Storybook: a Claude Code plugin with the process, and an npm package,
`@tinkerbench-studio/drawing-board`, with the snapshot commands the process relies on. Each project
keeps what is particular to it in one short file and one config file.

| Skill | What it covers |
| --- | --- |
| `design-change` | A design is worked out on a prototype page named after the ticket, folded into the canvas on the owner's go-ahead, and only then built |
| `canvas-sync` | Who owns what, publishing and refreshing in the same change, refreshing only the boards you changed, snapshot conflicts, a board and its story that disagree |
| `flow-pages` | One canvas page per user flow, and where a new board goes |
| `ux-picture` | The board-beside-story picture a UX bug or fix carries, and getting it onto the ticket |

## Using it in a project

1. The plugin is listed in the studio marketplace,
   [tinkerbench-studio/marketplace](https://github.com/tinkerbench-studio/marketplace), as
   `drawing-board@tinkerbench-studio`. Add that marketplace and turn the plugin on in the project's
   `.claude/settings.json`:

   ```json
   {
     "extraKnownMarketplaces": {
       "tinkerbench-studio": { "source": { "source": "github", "repo": "tinkerbench-studio/marketplace" } }
     },
     "enabledPlugins": { "drawing-board@tinkerbench-studio": true }
   }
   ```

2. For cloud sessions, install it in the environment's setup script as well:

   ```bash
   claude plugin marketplace add tinkerbench-studio/marketplace
   claude plugin install drawing-board@tinkerbench-studio
   ```

   The cloud environment's GitHub access must cover the marketplace repository and this one.

3. Copy [`plugin/templates/drawing-board.md`](plugin/templates/drawing-board.md) to
   `.claude/drawing-board.md` in the project and fill it in: the canvas link, the snapshot folder,
   the commands for each step, the flow pages and the ticket key for prototype pages.

4. Slim the project's own canvas skills down to what the template does not cover, and point them
   at these.

## The snapshot commands: `@tinkerbench-studio/drawing-board`

This repository is also an npm package, published to GitHub Packages, with the snapshot the skills
rely on. The canvas is private, so CI reads a committed snapshot of it, kept as one set of files per
board so two pull requests conflict only when they change the same board.

| Command | What it does |
| --- | --- |
| `drawing-board snapshot --from <folder> --version <version> [--boards A.dc.html,B.dc.html [--tokens]]` | Writes the snapshot from a folder read from the canvas (`project/canvas.json`, the tokens, each mapped board, `artifact-type/dc-runtime.js`). With `--boards`, rewrites only those boards and leaves every other board's files byte for byte. Refuses, writing nothing, a board it cannot find |
| `drawing-board check` | Every board is mapped; every story it names exists; every mapped board's copy was read by a refresh (its hash matches, whatever the line endings); the story index, samples and components match the copies; the tokens board shows every token. Exits 1 with each problem named |
| `drawing-board index` | Rewrites `story-index.json` from the map files, no canvas needed |
| `drawing-board report` | Boards with no story, and stories no board points at |

Each board has, under `<snapshot>/boards/`:

- `<Board>.meta.json`, written by a refresh: title, page, size and, for a board a story shows, its
  copy's hash and version, `data-sample` values and `data-component` markup. The version moves only
  when the copy does.
- `<Board>.map.json`, kept by hand: `{"story": "Pages/Account"}` (optionally `"status"`), or
  `{"none": "why"}`.
- `<Board>.dc.html`, the copy, for a board a story shows.

### Setting it up in a project

1. Point npm at GitHub Packages for the scope, in the project's `.npmrc`:

   ```
   @tinkerbench-studio:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
   ```

   Locally, `NODE_AUTH_TOKEN` is a token with `read:packages` (`gh auth token` works once
   `gh auth refresh -s read:packages` has added the scope). In GitHub Actions it is the workflow's
   `GITHUB_TOKEN`, once the package's settings ("Manage Actions access") grant the project's
   repository read access.

2. `npm install --save-dev @tinkerbench-studio/drawing-board@0.1.0`

3. Add `drawing-board.config.json` at the project's root:

   ```json
   {
     "artifact": "https://claude.ai/artifact/…",
     "snapshot": "design/canvas",
     "stories": ["src/**/*.stories.tsx"],
     "tokens": "tokens.json",
     "prototypePages": "\\b[a-z]{2,6}-\\d+\\b",
     "tokensBoard": "SystemTokens.dc.html"
   }
   ```

   | Field | |
   | --- | --- |
   | `artifact` | The canvas's link |
   | `snapshot` | The snapshot folder, from the config file's folder |
   | `stories` | Globs of the story files; a story's title is its `title: '…'` |
   | `tokens` | Optional. The tokens file under `project/` in the folder a refresh reads (default `tokens.json`) |
   | `prototypePages` | Optional. A case-blind regular expression matched against each page's id and name; boards on a matching page are left out of the snapshot (default: a ticket key, such as `NOK-12`) |
   | `tokensBoard` | Optional. A board that shows every token by `--name` and value, checked against the tokens |

4. Run `npx drawing-board check` in CI.

The functions behind the commands are exported too (`import { componentProblems, checkProblems } from
'@tinkerbench-studio/drawing-board'`), for checks a project adds of its own, such as built components
against the board's `data-component` markup.

### Releasing

Bump `version` in `package.json`, merge, then push the tag `v<version>`. CI tests it and publishes it
to GitHub Packages.

## The commands a project provides

The skills name steps, and `.claude/drawing-board.md` maps each step to a command: the snapshot steps
to `drawing-board`, and comparing a board with its story, making the picture and uploading it to the
project's own. A project that lacks a step says so in that file.
