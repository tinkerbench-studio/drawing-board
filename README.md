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
| `design-audit` | The audit of the canvas against Storybook: one issue per page with a picture, for the real differences nobody has raised, and no code changed |

`canvas-sync` and `design-change` also watch the canvas's 512-file limit, and `flow-pages` keeps the
pages in `pages.json`.

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
   `.claude/drawing-board.md` in the project and fill it in: the canvases and their links, the
   snapshot folder, the commands for each step and the ticket key for prototype pages. The flow
   pages go in the snapshot's `pages.json`.

4. Install the snapshot commands, the package below ("Setting it up in a project"). The skills and
   the template call `drawing-board snapshot`, `check`, `index`, `status` and `find`; without the package, map each
   of those steps to the project's own command in `.claude/drawing-board.md`, or say it has none.

5. Slim the project's own canvas skills down to what the template does not cover, and point them
   at these.

## The commands: `@tinkerbench-studio/drawing-board`

This repository is also an npm package, published to GitHub Packages, with every command the skills
rely on. The canvas is private, so CI reads a committed snapshot of it, kept as one set of files per
board so two pull requests conflict only when they change the same board.

**Convention over configuration.** Every command works in a project laid out the conventional way,
with no settings at all. A project that differs says only how, in a `drawing-board.config.json` file (below).

| Command | What it does |
| --- | --- |
| `drawing-board snapshot --from <folder> --version <version> [--boards A.dc.html,B.dc.html [--tokens]]` | Writes the snapshot from a folder read from the canvas (`project/canvas.json`, the tokens, each mapped board, `artifact-type/dc-runtime.js`), and its record, `artifact.json` (below). With `--boards`, rewrites only those boards and leaves every other board's files byte for byte; it then names the boards on the canvas that have no meta file and were not named, which a full refresh adds. Refuses, writing nothing, a board it cannot find |
| `drawing-board check` | Every board is mapped; every story it names exists; every mapped board's copy was read by a refresh (its hash matches, whatever the line endings); the story index, samples and components match the copies; the tokens board shows every token; `artifact.json` is the record of this canvas; every board is on a page `pages.json` lists, with its prefix; no board name is in two snapshots; the optional checks the project turned on (`checks`, below). Then the project's own checks (`checks()`, below). Exits 1 with each problem named. Then the canvas files and the warnings (below), which never change the exit code. With several canvases it checks each one that has a snapshot, its id before each line |
| `drawing-board index` | Rewrites `story-index.json` from the map files, no canvas needed |
| `drawing-board report` | Boards with no story, and stories no board points at |
| `drawing-board status --from <folder>` | A folder read from the canvas against the snapshot, before a refresh: boards on the canvas with no meta file, meta files of boards no longer there, boards on another page, copies changed on the canvas, the files the canvas holds (counted as below), and the design systems installed against the record and the `designSystems` setting. Writes nothing; exits 0. Refuses a folder with no `project/canvas.json` |
| `drawing-board find <words…>` | The boards whose name (its CamelCase words too), title, page, page flow and keywords (`pages.json`), story, tags, reason for no story, components or sample keys hold any of the words, whatever the case. Most words matched first, then by canvas and file: the canvas, page, board and story. Searches every snapshot |

`snapshot`, `check`, `index`, `report`, `status` and `find` take `--canvas <id>` to work on one canvas
of several (below). Without it, `check` and `find` read every canvas that has a snapshot, and the others
the main canvas.

The browser commands need `playwright-core` (an optional peer dependency: `npm install --save-dev
playwright-core`) and a Chromium, found as "Which Chromium" (below) says. `drawing-board browser`
prints the one they would start and why:

| Command | What it does |
| --- | --- |
| `drawing-board annotate [--board <Board>.dc.html] [--storybook <dir>] [--story-id <id>] [--width N] [--theme light\|dark]` | The picture a UX change carries: the board's committed copy beside its story from the built Storybook, at one width, each under a banner naming where it came from (DESIGN CANVAS: the board, canvas link and copy version; STORYBOOK: the story, its id, the commit), every difference boxed on both sides with the same number in its own colour, and a table. Writes `<out>/shots/<Board>-side-by-side.png` and `.md`. With no `--board`, every board a story shows. `board-shot` is its earlier name and still works. In code: `boardShots` from `'@tinkerbench-studio/drawing-board/pictures'` (see "The functions behind the commands" below). The story is the one in the built Storybook unless the project's `storyPage()` hook (below) draws it. The differences come from `<differences>/<Board>.json` (the `differences` setting; `<snapshot>/differences/` unless set) when there is one, else from the comparison below (only what is visible; the table says so) |
| `drawing-board layout [--board <Board>.dc.html] [--storybook <dir>] [--story-id <id>] [--width N] [--tolerance N] [--attr <attribute>] [--origin <selector>]` | Where the named landmarks sit on each board and on its story, measured from the top left of the screen at one width and in one font. A landmark is an element marked `data-landmark="name"` on the board and on the component the story draws (`--attr` names another attribute; `--origin` a selector to measure from, when the screen sits at an offset). Two boxes within `--tolerance` pixels (2 by default) are the same; each is reported as same, moved, resized, or on one side only. Writes `<out>/layout/layout.md`, and for every screen outside tolerance or with nothing marked a picture of each side (`<Board>-board.png`, `<Board>-story.png`). Advisory: it never sets an exit code. A board whose story cannot be drawn is listed as not measured |
| `drawing-board compare [--storybook <dir>]` | Each board a story shows beside that story from the built Storybook, compared by wording: the headings, buttons, links, labels and list items only on one side, leaving values out (`decided` in a map entry keeps an agreed difference apart). An element's text is its parts joined with a space, but none where a `/` meets the join, so an `owner/name` split across elements reads as one name. Writes `<out>/compare.md` |
| `drawing-board page-shots [--only page,page] [--theme <theme>] [--mark <selector>] [--out <dir>]` | The pages the project's `pages()` hook returns, each in every theme (set as `data-theme` on `<html>`) and a 390 px phone in the first; with no themes, as it is and its phone. Writes `<out>/pages/<page>-<variant>.png` |
| `drawing-board browser` | The Chromium the commands below would start and where it was found: the variable, the `chromium` setting, playwright-core's own or a known place ("Which Chromium", below). Fails, listing every path it looked in, when there is none |
| `drawing-board story-shot <storybook-static-dir> <story-id> <out.png> [--width N] [--theme light\|dark]` | One story from a built Storybook, on its own page. With neither flag it writes `<out>-dark.png`, `<out>-light.png` and `<out>-phone.png` (dark, 390 px); the theme is passed as Storybook's `theme` global. `--list` prints the story ids |
| `drawing-board compare-pictures <before-dir> <after-dir> <out-dir> [--from-x N] [--left BEFORE] [--right AFTER]` | Each picture in both folders, paired by name, before beside after under banners, with what changed outlined in red. The rows are lined up first, so a change that pushes a page down outlines only the change |

### Which Chromium

playwright-core starts only the browser build its own version was made with, so a project that pins
a different playwright-core than the machine's installed browsers could not take a picture. A Claude
Code cloud session, for one, ships Playwright's browsers for its own version in `/opt/pw-browsers`.
So the browser commands look for a Chromium in this order and start the first they find:

1. **`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`**, when set: that file. A path with no file there is
   refused, naming the variable, rather than quietly starting another browser.
2. **The project's `chromium` setting** in `drawing-board.config.json`: the first of its paths that
   exists (a relative path is from the project folder). Paths that do not exist on this machine are
   skipped, so one list can name a browser for each machine the project runs on.
3. **playwright-core's own browser**, when it is installed (`npx playwright-core install chromium`).
4. **The known places**, the first that exists:

   | Path | What it is |
   | --- | --- |
   | `/opt/pw-browsers/chromium` | A Claude Code cloud session's Chromium |
   | `/usr/bin/chromium`, `/usr/bin/chromium-browser` | A Linux package's Chromium |
   | `/usr/bin/google-chrome`, `/usr/bin/google-chrome-stable` | Google Chrome on Linux (and GitHub's Ubuntu runners) |
   | `/Applications/Chromium.app/Contents/MacOS/Chromium` | Chromium on macOS |
   | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` | Google Chrome on macOS |
   | `<folder>/chromium-<build>/chrome-linux64/chrome` (and `chrome-linux`, `chrome-mac`, `chrome-mac-arm64`) | Any Playwright browser build, the newest first, in `PLAYWRIGHT_BROWSERS_PATH`, `~/.cache/ms-playwright` and `~/Library/Caches/ms-playwright` |

With none found, the command fails and lists every path it looked in.

**Overriding it.** For one machine or one run, set the variable:
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chrome npx drawing-board story-shot …`. For a project,
name its browsers in `drawing-board.config.json`; they are tried before playwright-core's own and the
known places:

```json
{ "chromium": ["tools/chromium/chrome", "/opt/company/chrome"] }
```

`"chromium"` takes one path or a list. In code, `launch({ chromium, root })` from
`'@tinkerbench-studio/drawing-board/pictures'` takes the same list, and `launchOptions(config)` gives
a loaded config's.

**A Storybook built under a path.** A Storybook built to be served inside a site (Vite's
`base: '/storybook/'`) asks for its scripts under that path. The commands read it from the built
`iframe.html` and serve the build there as well as at the root, so such a build needs no rebuild.

A fix's before and after: run `page-shots` (or `story-shot`) in a worktree of the merge base and on
the branch, then `compare-pictures` the two folders.

A board's differences file, `<snapshot>/differences/<Board>.json`, is optional: `{ "fixture"?,
"differences": [{ "title", "detail", "board": "<selector>" | null, "story": "<selector>" | null }],
"notDifferences"?, "aligned"?, "notAligned"? }`, eight differences at most (one per colour). A
selector that matches nothing fails, so a list that drifts from the screen is noticed.

Each board has, under `<snapshot>/boards/`:

- `<Board>.meta.json`, written by a refresh: title, page, size and, for a board a story shows, its
  copy's hash and version, `data-sample` values and `data-component` markup. The version moves only
  when the copy does.
- `<Board>.map.json`, kept by hand: `{"story": "Pages/Account"}` (optionally `"status"`, `"page"` for
  its full-page story's export, `"decided"`, and `"tags"`, a list of words `find` uses), or
  `{"none": "why"}`. **A board that is built must be mapped to its story, not `none`:** the snapshot
  copies a board's markup only when a story shows it, so a `none` board has nothing to compare with.
  `check` warns (without failing) when a `none` board is named by a story or its note says it is
  built, and fails when a mapped board has no copy; `snapshot --boards` says when a named board is
  `none` and so was not copied. `check` also warns when `tags` is not a list of non-empty strings.
- `<Board>.dc.html`, the copy, for a board a story shows.

Beside `boards/`, the snapshot has:

- `artifact.json`, the record of the canvas, written by every refresh (below).
- `pages.json`, kept by hand and optional: the canvas's pages (below).
- `tokens.json`, the canvas's tokens, and `story-index.json`, the story-to-board index.

### The record: `artifact.json`

Every refresh writes the snapshot's record of the canvas it read, in this order:

```json
{
  "canvas": "main",
  "artifact": "https://claude.ai/artifact/…",
  "version": "52",
  "fullVersion": "48",
  "files": 311,
  "canvasBoards": 240,
  "unread": ["acme"],
  "boards": ["Account.dc.html", "Home.dc.html"],
  "designSystems": { "acme": "3" }
}
```

- `canvas` is the canvas's id in the config, and `artifact` its link.
- `version` is the version read. `fullVersion` is the version of the last full refresh; a partial one
  keeps it, and it is left out until there has been one.
- `files` is how many files the canvas holds, counted as in "The canvas's 512 files" below.
  `canvasBoards` is how many of them are boards, on every page. `unread` names the installed design
  systems whose files were not read, so `files` is a lower bound; it is left out when there are none.
- `boards` lists the boards on the canvas, outside prototype pages, sorted.
- `designSystems` is each design system installed on the canvas (`designSystems` in `canvas.json`),
  namespace to version.

`check` fails when `canvas` or `artifact` is not the config's. An older `artifact.json` holding only
`{"artifact": …}` is still read; the next refresh writes the whole record.

### Pages: `pages.json`

A project may list its canvas's pages in `<snapshot>/pages.json`, by hand. A refresh never writes it.

```json
{
  "queue": { "flow": "Land a pull request, from review to merged", "prefixes": ["Queue", "Merge"], "keywords": ["merge queue", "review"] },
  "admin": { "flow": "Run the studio" }
}
```

- `flow` is the journey the page covers, in one line. It is required.
- `prefixes` are how its boards' names start. When a page lists any, `check` fails a board on it that
  starts with none of them.
- `keywords` are the words a ticket about the flow uses; `find` searches them, and the `flow-pages`
  skill matches a ticket's words to them.

When `pages.json` exists, `check` also fails a board on no page or on a page it does not list. A file
of the wrong shape is refused with what to fix.

### The canvas's 512 files, and the warnings

A Design canvas holds at most 512 files of its own: every board, `canvas.json`, the tokens file and any
installed design system's files (`project/ds/`). A publish over that is refused. A design adds about four
files: dark, light and a 390 px view of each.

A refresh counts them from what it read. A read holds only `canvas.json`, the tokens and the boards
a story shows, so the count does not rest on the folder alone: it is every board `canvas.json` lists,
on every page (prototype pages too), plus `canvas.json` and the tokens file, plus every other file the
folder holds (`project/ds/**`, assets); or the folder's own file count, when that is larger.

- **What it assumes.** `canvas.json` names each installed design system but not its files. So the
  count assumes every file under `project/ds/<namespace>/` was read when any of it was; reading only
  some of a namespace's files cannot be detected. `snapshot` and `status` say so.
- **Not read at all.** When the folder holds no files under `project/ds/<namespace>/` for a design
  system `canvas.json` lists, the refresh records it in `unread`, and `snapshot`, `status` and `check`
  say the canvas holds at least that many files.
- **A partial refresh** reads only a few boards, so its folder often lacks files a full read held. It
  takes the files that are not boards from the last record as a floor: the boards `canvas.json` lists
  now, plus the last `files` less the last `canvasBoards`, plus the files it read of each design
  system the last count left out (one installed since, or one the last record listed as `unread`).
  When it uses the floor, `unread` is the last one, plus each such design system it did not read,
  less the ones it did, and only design systems `canvas.json` still lists. A full refresh stores the
  count as counted. A count kept by the floor can stay too high
  after files are removed from the canvas, until the next full refresh. A record from before
  `canvasBoards` gives no floor, so the first partial refresh after upgrading stores what it counted.

`check` says how many are in use, from the record's `files` ("at least", with the reason, when the
record has `unread`):

```
Canvas files: 311 of 512 in use, 201 free (canvas version 52).
```

When there is no `artifact.json` yet, or it has no `files`, `check` counts the meta files plus 2, says
that is a lower bound ("at most … free"), and that a refresh records the count. For the count between
refreshes, run `status --from` on a fresh read.

The line is information while there is room. It becomes a **warning** when fewer than `headroom` files
are free (16 by default) or the canvas is full. Warnings are their own channel: printed after the
problems or the in-step line, each starting `warning: `, on stderr, and they never change the exit
code. `check` also warns about:

- boards `artifact.json` lists that have no meta file (a partial refresh does not add them; a full one
  does);
- each design system in the `designSystems` setting whose recorded version is missing or different
  ("installed 2, expected 3: install it again on the canvas, then refresh");
- a board mapped `none` that a story names, or whose note says it is built (map it to its story and
  refresh, or its markup is never committed);
- a map entry's `tags` that is not a list of non-empty strings (`find` then leaves it out). A map
  entry may hold a project's own fields, so this never fails an existing project's check.

`checkWarnings(config)` returns them, beside `checkProblems(config)`; `filesInUse` builds the line.

### Several canvases: the `canvases` setting

One canvas is enough for most projects. A project that outgrows it spreads its designs over several,
by role:

| Role | What it holds | Snapshot |
| --- | --- | --- |
| `main` | The designs that are built, and the source of truth after they are built. Exactly one | Always: `design/canvas` unless set |
| `prototypes` | Designs under way, one page per ticket. At most one | Never: prototypes are not read into a snapshot |
| `reference` | Boards that are not app screens: architecture, another repository's UI | Only when `snapshot` is set |

```json
{
  "canvases": [
    { "id": "main", "role": "main", "artifact": "https://claude.ai/artifact/…" },
    { "id": "prototypes", "role": "prototypes", "artifact": "https://claude.ai/artifact/…" },
    { "id": "reference", "role": "reference", "artifact": "https://claude.ai/artifact/…", "snapshot": "design/reference" }
  ],
  "designSystems": { "acme": "3" }
}
```

- Each canvas has an `id` (lowercase, `[a-z][a-z0-9-]*`, unique), a `role` and its `artifact` link,
  and may have a `snapshot` and its own `prototypePages` (else the top-level one).
- With `canvases`, the top-level `artifact` and `snapshot` are refused: they belong to a canvas.
  Without it, the file is one canvas, `{ "id": "main", "role": "main" }`, from the top-level fields.
- `--canvas <id>` picks the canvas; the main one by default. An unknown id is refused, naming the ids.
  So are `--canvas` with no id and the `--canvas=<id>` form, rather than falling back to main.
- The tokens are the main canvas's: `tokensBoard`, `checks.tokenThemes` and `checks.tokensCss` hold
  only the main canvas to them.
- A board's name is unique across the snapshots: `check` fails a board with a meta file in two of them.
- Hooks are loaded with the main canvas's config, and `checks()` runs once.
- Components are shared through a design system, installed on each canvas. The canvas records it in
  `canvas.json` as `designSystems: [{ title, namespace, artifact, version, copiedAt }]`, and the
  `designSystems` setting says which version each canvas should have.

`loadConfig(path, canvasId)` gives one canvas's config; `snapshotConfigs(config)` one for each canvas
with a snapshot.

### The conventions, and `drawing-board.config.json`

The commands look for `drawing-board.config.json` (JSON) in the working folder and each folder above
it. With none, every setting is its convention. **`drawing-board.config.json` is the preferred name.**
`.drawing-board` is the earlier name and is still read, kept for compatibility: where both are in one
folder `drawing-board.config.json` wins and the other is ignored, and a nearer folder's file of either
name wins over a farther one's. `--config <file>` reads either name. New projects should use the
preferred name; an existing `.drawing-board` needs no change. An unknown setting is refused, so a typo is not ignored.

| Setting | Convention | What it is |
| --- | --- | --- |
| `artifact` | Read from `<snapshot>/artifact.json` | The canvas's link; set it once, for the first snapshot. Not with `canvases` |
| `snapshot` | `design/canvas` | The snapshot folder. Not with `canvases` |
| `canvases` | One `main` canvas from `artifact` and `snapshot` | The project's canvases by role (above) |
| `designSystems` | None | The design systems each canvas should have installed, namespace to version: `{ "acme": "3" }`. `check` warns when the record differs |
| `limits` | `{ "files": 512, "headroom": 16 }` | The canvas's file limit, and the free files below which `check` warns |
| `stories` | `["**/*.stories.{ts,tsx,js,jsx,mdx}"]` | Globs of the story files (never node_modules or the built Storybook); a story's title is its `title: '…'` |
| `storybook` | `storybook-static` | The built Storybook the browser commands read |
| `out` | `reports/design-canvas` | Where they write: `shots/`, `layout/`, `pages/`, `compare.md` |
| `differences` | `<snapshot>/differences` | The folder holding each board's differences list, `<Board>.json`, which `annotate` reads |
| `tokens` | `tokens.json` | The tokens file under `project/` in the folder a refresh reads |
| `prototypePages` | A ticket key (`NOK-12`, `proto-tck-153`) | A case-blind regular expression matched against each page's id and name; boards on a matching page are left out. A canvas in `canvases` may set its own |
| `tokensBoard` | None | A board that shows every token by `--name` and value, checked against the tokens |
| `themes` | None | The themes `page-shots` draws, such as `["dark", "light"]` |
| `hooks` | `<snapshot>/drawing-board.{ts,tsx,mts,mjs,js}` | The project's hook module |
| `checks` | None (all off) | The optional generic checks `drawing-board check` runs, below |
| `chromium` | None | A Chromium executable, or a list tried in order, for the browser commands; tried after `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` and before playwright-core's own browser and the known places ("Which Chromium", above) |

### Optional checks: the `checks` setting

Small checks every project could use, each off until it is named in `checks`, and each adding lines to
`drawing-board check`'s problems:

```json
{ "checks": { "repeatedSampleKeys": true, "outlineSelectors": true, "passedSamples": true, "tokenThemes": true, "tokensCss": ["src/**/*.css"] } }
```

| Flag | What it checks |
| --- | --- |
| `repeatedSampleKeys` | No committed copy uses a `data-sample` key twice. The snapshot refuses a repeat anyway; this names the board and key and how to fix it (numbered keys), and reports it on its own, before the snapshot comparison would stop at its plainer refusal |
| `outlineSelectors` | A board's map entry `outline` (`{ "board": [selectors], "story": [selectors] }`, for a board with a story) has readable selectors (tags, `.classes`, `#ids`, `[attributes]`, spaces for "inside") and each board selector names something in the board's copy |
| `passedSamples` | A `<dc-import>` passing a value with `data-sample-<prop>="group.name"` is well formed: the prop is passed, the key is `group.name`, used once, and the value is not empty or a `{{hole}}`. `snapshot` reads only leaf `data-sample` marks, so these values are not in `meta.json`; this only checks them (`passedSamples` is exported for a project to read them) |
| `tokenThemes` | Every colour in `tokens.json` has a string value for every theme listed in `color.themes` |
| `tokensCss` | A list of stylesheet globs from the project folder: each canvas colour and font family is declared as `--name` with the same value, and each radius and shadow is used (`border-radius`, `box-shadow`). A glob list that finds no file is a problem. Reads `color.tokens`, `type.families`, `radius.tokens` and `shadow.tokens`; a section the tokens lack is skipped |

The functions are exported too (`repeatedSampleKeys`, `outlineProblems`, `passedSamples`,
`themeValueProblems`, `tokenCssProblems`).

### Hooks: what only the project can supply

A project's own pieces go in one module, found by convention at `<snapshot>/drawing-board.ts` (or
`.tsx`, `.mts`, `.mjs`, `.js`). Every export is optional, and each gets `{ config, canvas }`: the
settings (`config.root` is the project folder) and the snapshot on disk.

```ts
import { componentProblems, componentsOf, type HookContext, type StoryRequest } from '@tinkerbench-studio/drawing-board'

/** More problems for drawing-board check. */
export const checks = ({ canvas }: HookContext) => componentProblems(componentsOf(canvas.metas())['Components.dc.html'] ?? {}, builtComponents())

/** The pages drawing-board page-shots shoots: HTML by name, or { html, width, css }. */
export const pages = () => ({ home: renderHome(sample) })

/**
 * How a story is served, for `annotate` and `layout`: the page to draw beside the board, `{ html, assets?, ready? }`
 * (`assets` is a folder served at the page's root, for what the HTML links; `ready` a selector to wait for). It gets
 * `{ config, canvas, board, story, page? }`: the board's file and its map entry's story title and full-page export.
 * Return undefined to fall back to the built Storybook. A project with no built Storybook of its own, or one that
 * draws stories from saved markup, supplies this instead of `storybook`.
 */
export const storyPage = ({ story }: HookContext & StoryRequest) => savedMarkup(story) && { html: pageAround(savedMarkup(story)), assets: 'assets' }
```

Where the differences list lives is the `differences` setting; how a story is served is the `storyPage()` hook, both
used by `annotate`, and the hook by `layout` as well.

The module is bundled with esbuild (an optional peer dependency, needed only when there are hooks)
into the project's `node_modules/.cache`, so it imports the project's own packages, TypeScript and JSX
(as the nearest `tsconfig.json` sets it), and Vite's eager `import.meta.glob` of JSON files.

### Setting it up in a project

1. Point npm at GitHub Packages for the scope, in the project's `.npmrc`:

   ```
   @tinkerbench-studio:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
   ```

   GitHub Packages' npm registry asks for a token on every install, even for a public package. npm
   runs normally with `NODE_AUTH_TOKEN` unset; it is only read when a package from the scope is
   fetched. Where it is needed:

   - **Locally**, a token with `read:packages` and nothing else, not your full `gh auth token`: the
     package runs with whatever token the environment holds.
   - **In GitHub Actions**, the workflow's `GITHUB_TOKEN`, once the package's settings ("Manage
     Actions access") grant the project's repository read access.
   - **In a cloud session**, set in the environment, as the setup script's other secrets are.

   A git install (`github:tinkerbench-studio/drawing-board#v<version>`) also works, since `prepare`
   builds `dist/`, but while this repository is private it needs git credentials for it instead (an
   SSH key or `gh auth setup-git`; in CI, a deploy key), so it saves no secret.

2. Run it with a pinned `npx` script, which never touches `npm ci`:
   `"drawing-board": "npx --yes -p @tinkerbench-studio/drawing-board@0.6.2 -p playwright-core@<version> -p esbuild@<version> drawing-board"`.
   npx cannot see the project's `node_modules`, so the optional peers come with it: `playwright-core`
   for the browser commands and `esbuild` for hooks, each pinned to the project's own version. Run it
   as `npm run drawing-board -- check`. The version is pinned but not hashed, and `--yes` skips the
   prompt. A project whose CI runs `drawing-board check` may prefer a dev dependency
   (`npm install --save-dev @tinkerbench-studio/drawing-board@0.6.2`), hashed in the lockfile, at the
   cost of every `npm ci` needing the token.

3. Add a `drawing-board.config.json` (or the earlier `.drawing-board`) only for what differs from the conventions above. Nookivia's, for example:

   ```json
   {
     "snapshot": "fixtures/design-canvas",
     "tokens": "ds/nookivia/tokens.json",
     "prototypePages": "^prototypes\\b"
   }
   ```

4. Run the check in CI (`npx drawing-board check`, or the pinned script), with `NODE_AUTH_TOKEN`
   set to the workflow's `GITHUB_TOKEN` on that step.

The functions behind the commands are exported too (`'@tinkerbench-studio/drawing-board'`; the
browser half from `'@tinkerbench-studio/drawing-board/pictures'`). `annotate` is `boardShots(config, options)`
there, which returns `{ made, failed }` instead of an exit code; `boardShotOptions(argv)` reads its flags and
`boardShot(config, { board, … })` makes one board's picture. The entry does not load `playwright-core` or
`esbuild`, so import these from `/pictures`.

### Reading the samples in stories: `/samples` and `/samples/esbuild`

A story shows the values a board marks with `data-sample`, which a refresh copies into each
`boards/<Board>.meta.json`. `createCanvasSamples` reads them; it imports nothing from Node, so Vite and
Storybook bundle it. The project passes in the files, because Vite resolves `import.meta.glob` relative to the
file that calls it:

```ts
import type { BoardMeta } from '@tinkerbench-studio/drawing-board'
import { createCanvasSamples } from '@tinkerbench-studio/drawing-board/samples'

export const { canvasSample, canvasHas, canvasKeys } = createCanvasSamples(
  import.meta.glob<BoardMeta>('./boards/*.meta.json', { eager: true, import: 'default' }),
)
```

- `canvasSample(board, key)` is the text the board shows, and throws, naming the board and key, when the snapshot lacks it.
- `canvasHas(board, key)` says whether the board marks `key`; `canvasKeys(board)` lists its keys in board order.
- `canvasSampleOrNull(board, key)` is the same, with null for a key the board lacks.
- A board whose copy no refresh has read is ignored. A second argument, `{ extras: { '<Board>.dc.html': { 'group.name': 'text' } } }`, adds values that win over the board's own (values passed to an import, say) and makes such a board count.

Code that bundles such a module with esbuild (a script that renders pages, say) has no `import.meta.glob`.
`viteJsonGlob()` from `'@tinkerbench-studio/drawing-board/samples/esbuild'` is the esbuild plugin that gives it
the same files, read at bundle time (esbuild is the optional peer dependency; the plugin is Node only, which is
why it is its own entry):

```ts
import { viteJsonGlob } from '@tinkerbench-studio/drawing-board/samples/esbuild'

await esbuild.build({ entryPoints: ['pages.ts'], bundle: true, plugins: [viteJsonGlob()] })
```

It rewrites eager `import.meta.glob` calls of `.json` files (`import: 'default'` gives each file's JSON, as in Vite; with no `import`, each value is `{ default: <json> }`), in any `.js`, `.jsx`, `.ts` or `.tsx` file it
loads, and leaves every other glob alone (a lazy one included). The patterns are read from disk relative to the file that calls the
glob, so a snapshot kept elsewhere than that glob names is not found by a different setting. A type argument may nest
generics up to two levels (`Record<string, Record<string, string>>`). It uses `fs.globSync`, so it needs Node 22 or
newer. Hooks are bundled with it already.

### Releasing

Bump `version` in `package.json` and merge. The `release` job in `ci.yml` sees the push raise the version, tags it `v<version>`, cuts a
GitHub release and publishes the package to GitHub Packages. It releases a version once: one already tagged is left alone. The plugin
marketplace pins this repository by that tag, so after a release change the `drawing-board` `ref` in `tinkerbench-studio/marketplace` to
it by hand. A version merged before the job existed, or a release that failed, is released by running the CI workflow by hand on `main`
(`workflow_dispatch`); pushing a `v*` tag by hand still publishes it.

## The commands a project provides

The skills name steps, and `.claude/drawing-board.md` maps each step to a command, which is
`drawing-board`'s by convention. A project names its own only where it differs (uploading a picture,
say), and says so in that file.

## License

[MIT](LICENSE) © Maddie Carter-Smith
