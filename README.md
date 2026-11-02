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

4. Install the snapshot commands, the package below ("Setting it up in a project"). The skills and
   the template call `drawing-board snapshot`, `check` and `index`; without the package, map each
   of those steps to the project's own command in `.claude/drawing-board.md`, or say it has none.

5. Slim the project's own canvas skills down to what the template does not cover, and point them
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

And two picture commands for a UX change, which need no config but do need `playwright-core` (an
optional peer dependency: `npm install --save-dev playwright-core`) and a Chromium, from
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when set:

| Command | What it does |
| --- | --- |
| `drawing-board story-shot <storybook-static-dir> <story-id> <out.png> [--width N] [--theme light\|dark]` | One story from a built Storybook, on its own page. With neither flag it writes `<out>-dark.png`, `<out>-light.png` and `<out>-phone.png` (dark, 390 px); the theme is passed as Storybook's `theme` global. `--list` prints the story ids |
| `drawing-board compare-pictures <before-dir> <after-dir> <out-dir> [--from-x N] [--left BEFORE] [--right AFTER]` | Each picture in both folders, paired by name, before beside after under banners, with what changed outlined in red. The rows are lined up first, so a change that pushes a page down outlines only the change. `--from-x` leaves out the columns to its left (a sidebar the same on both sides); `--left` and `--right` relabel the banners (`BOARD`, `STORY`) |

A fix's pictures: build Storybook at the merge base and on the branch, `story-shot` the same story
from each into `shots/before` and `shots/after`, then `compare-pictures shots/before shots/after
<out>`.

The comparison of a board's wording with its story's is a library function, since each project draws
its stories its own way: `comparePages(map, boardHtml, stories)` takes the map, a reader of the
board copies and each story's markup by title, and lists the headings, buttons, links, labels and
list items only on one side, leaving values out (`decided` in a map entry keeps a difference that
was agreed apart); `comparisonReport` writes it as Markdown.

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

   npm runs normally with `NODE_AUTH_TOKEN` unset; it is only read when a package from the scope is
   fetched. Where it is needed:

   - **Locally**, a token with `read:packages` and nothing else, not your full `gh auth token`: the
     package runs with whatever token the environment holds.
   - **In GitHub Actions**, the workflow's `GITHUB_TOKEN`, once the package's settings ("Manage
     Actions access") grant the project's repository read access.
   - **In a cloud session**, set in the environment, as the setup script's other secrets are.

2. Install it, one of two ways:

   | | A pinned `npx`, no dependency | A dev dependency |
   | --- | --- | --- |
   | How | A script, `"drawing-board": "npx --yes @tinkerbench-studio/drawing-board@0.1.0"`, run as `npm run drawing-board -- check` | `npm install --save-dev @tinkerbench-studio/drawing-board@0.1.0`, run as `npx drawing-board check` |
   | `npm ci` | Never touches GitHub Packages, so no install anywhere needs the token | Every `npm ci` needs the token: each CI step, every machine, every cloud session |
   | Integrity | None: the version is pinned but not hashed, and `--yes` skips the prompt | Hashed in the lockfile |
   | Upgrading | Edit the version in the script | Dependabot or `npm install`, with the lockfile |
   | Suits | A project that runs the commands by hand while it moves its snapshot over | A project whose CI runs `drawing-board check` |

   Nookivia uses the pinned `npx` for now; a project that adds any dependency from the
   `@tinkerbench-studio` scope has taken the token cost already, so it should use the dependency.

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

4. Run the check in CI (`npx drawing-board check`, or the pinned script), with `NODE_AUTH_TOKEN`
   set to the workflow's `GITHUB_TOKEN` on that step.

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
