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

## The commands: `@tinkerbench-studio/drawing-board`

This repository is also an npm package, run from its public git tag (and published to GitHub Packages), with every command the skills
rely on. The canvas is private, so CI reads a committed snapshot of it, kept as one set of files per
board so two pull requests conflict only when they change the same board.

**Convention over configuration.** Every command works in a project laid out the conventional way,
with no settings at all. A project that differs says only how, in a `.drawing-board` file (below).

| Command | What it does |
| --- | --- |
| `drawing-board snapshot --from <folder> --version <version> [--boards A.dc.html,B.dc.html [--tokens]]` | Writes the snapshot from a folder read from the canvas (`project/canvas.json`, the tokens, each mapped board, `artifact-type/dc-runtime.js`). With `--boards`, rewrites only those boards and leaves every other board's files byte for byte. Refuses, writing nothing, a board it cannot find |
| `drawing-board check` | Every board is mapped; every story it names exists; every mapped board's copy was read by a refresh (its hash matches, whatever the line endings); the story index, samples and components match the copies; the tokens board shows every token. Then the project's own checks (`checks()`, below). Exits 1 with each problem named |
| `drawing-board index` | Rewrites `story-index.json` from the map files, no canvas needed |
| `drawing-board report` | Boards with no story, and stories no board points at |

The browser commands need `playwright-core` (an optional peer dependency: `npm install --save-dev
playwright-core`) and a Chromium, from `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when set:

| Command | What it does |
| --- | --- |
| `drawing-board board-shot [--board <Board>.dc.html] [--storybook <dir>] [--story-id <id>] [--width N] [--theme light\|dark]` | The picture a UX change carries: the board's committed copy beside its story from the built Storybook, at one width, each under a banner naming where it came from (DESIGN CANVAS: the board, canvas link and copy version; STORYBOOK: the story, its id, the commit), every difference boxed on both sides with the same number in its own colour, and a table. Writes `<out>/shots/<Board>-side-by-side.png` and `.md`. With no `--board`, every board a story shows. The differences come from `<snapshot>/differences/<Board>.json` when there is one, else from the comparison below (only what is visible; the table says so) |
| `drawing-board compare [--storybook <dir>]` | Each board a story shows beside that story from the built Storybook, compared by wording: the headings, buttons, links, labels and list items only on one side, leaving values out (`decided` in a map entry keeps an agreed difference apart). Writes `<out>/compare.md` |
| `drawing-board page-shots [--only page,page] [--theme <theme>] [--mark <selector>] [--out <dir>]` | The pages the project's `pages()` hook returns, each in every theme (set as `data-theme` on `<html>`) and a 390 px phone in the first; with no themes, as it is and its phone. Writes `<out>/pages/<page>-<variant>.png` |
| `drawing-board story-shot <storybook-static-dir> <story-id> <out.png> [--width N] [--theme light\|dark]` | One story from a built Storybook, on its own page. With neither flag it writes `<out>-dark.png`, `<out>-light.png` and `<out>-phone.png` (dark, 390 px); the theme is passed as Storybook's `theme` global. `--list` prints the story ids |
| `drawing-board compare-pictures <before-dir> <after-dir> <out-dir> [--from-x N] [--left BEFORE] [--right AFTER]` | Each picture in both folders, paired by name, before beside after under banners, with what changed outlined in red. The rows are lined up first, so a change that pushes a page down outlines only the change |

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
  its full-page story's export, `"decided"`), or `{"none": "why"}`.
- `<Board>.dc.html`, the copy, for a board a story shows.

### The conventions, and `.drawing-board`

The commands look for `.drawing-board` (JSON) in the working folder and each folder above it. With
none, every setting is its convention. An unknown setting is refused, so a typo is not ignored.

| Setting | Convention | What it is |
| --- | --- | --- |
| `artifact` | Read from `<snapshot>/artifact.json` | The canvas's link; set it once, for the first snapshot |
| `snapshot` | `design/canvas` | The snapshot folder |
| `stories` | `["**/*.stories.{ts,tsx,js,jsx,mdx}"]` | Globs of the story files (never node_modules or the built Storybook); a story's title is its `title: '…'` |
| `storybook` | `storybook-static` | The built Storybook the browser commands read |
| `out` | `reports/design-canvas` | Where they write: `shots/`, `pages/`, `compare.md` |
| `tokens` | `tokens.json` | The tokens file under `project/` in the folder a refresh reads |
| `prototypePages` | A ticket key (`NOK-12`, `proto-tck-153`) | A case-blind regular expression matched against each page's id and name; boards on a matching page are left out |
| `tokensBoard` | None | A board that shows every token by `--name` and value, checked against the tokens |
| `themes` | None | The themes `page-shots` draws, such as `["dark", "light"]` |
| `hooks` | `<snapshot>/drawing-board.{ts,tsx,mts,mjs,js}` | The project's hook module |

### Hooks: what only the project can supply

A project's own pieces go in one module, found by convention at `<snapshot>/drawing-board.ts` (or
`.tsx`, `.mts`, `.mjs`, `.js`). Both exports are optional, and each gets `{ config, canvas }`: the
settings (`config.root` is the project folder) and the snapshot on disk.

```ts
import { componentProblems, componentsOf, type HookContext } from '@tinkerbench-studio/drawing-board'

/** More problems for drawing-board check. */
export const checks = ({ canvas }: HookContext) => componentProblems(componentsOf(canvas.metas())['Components.dc.html'] ?? {}, builtComponents())

/** The pages drawing-board page-shots shoots: HTML by name, or { html, width, css }. */
export const pages = () => ({ home: renderHome(sample) })
```

The module is bundled with esbuild (an optional peer dependency, needed only when there are hooks)
into the project's `node_modules/.cache`, so it imports the project's own packages, TypeScript and JSX
(as the nearest `tsconfig.json` sets it), and Vite's eager `import.meta.glob` of JSON files.

### Setting it up in a project

1. Run it from its public git tag, which needs no registry and no token: npm fetches the tag from
   GitHub and its `prepare` script builds `dist/`. Add a script to the project's `package.json`:

   ```json
   "drawing-board": "npx --yes -p github:tinkerbench-studio/drawing-board#v0.3.1 -p playwright-core@<version> -p esbuild@<version> drawing-board"
   ```

   npx cannot see the project's `node_modules`, so the optional peers come with it: `playwright-core`
   for the browser commands and `esbuild` for hooks, each pinned to the project's own version. Run it
   as `npm run drawing-board -- check`. `npm ci` never installs it. The tag is pinned but not hashed,
   and `--yes` skips the prompt; upgrading is editing the tag in the script.

2. The package is also published to GitHub Packages, whose npm registry asks for a token even for a
   public package. Use it only if you want it as a dev dependency hashed in the lockfile: map the
   scope in `.npmrc` (`@tinkerbench-studio:registry=https://npm.pkg.github.com` and
   `//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}`), and then every `npm ci` needs a token with
   `read:packages`.

3. Add a `.drawing-board` only for what differs from the conventions above. Nookivia's, for example:

   ```json
   {
     "snapshot": "fixtures/design-canvas",
     "tokens": "ds/nookivia/tokens.json",
     "prototypePages": "^prototypes\\b"
   }
   ```

4. Run the check in CI with the pinned script; it needs no token.

The functions behind the commands are exported too (`'@tinkerbench-studio/drawing-board'`; the
browser half from `'@tinkerbench-studio/drawing-board/pictures'`).

### Releasing

Bump `version` in `package.json`, merge, then push the tag `v<version>`. Projects run the tag itself,
so it is the release; CI also tests it and publishes it to GitHub Packages.

## The commands a project provides

The skills name steps, and `.claude/drawing-board.md` maps each step to a command, which is
`drawing-board`'s by convention. A project names its own only where it differs (uploading a picture,
say), and says so in that file.

## License

[MIT](LICENSE) © Maddie Carter-Smith
