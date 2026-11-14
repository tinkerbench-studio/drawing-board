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

This repository is also an npm package, published to GitHub Packages, with every command the skills
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
| `drawing-board annotate [--board <Board>.dc.html] [--storybook <dir>] [--story-id <id>] [--width N] [--theme light\|dark]` | The picture a UX change carries: the board's committed copy beside its story from the built Storybook, at one width, each under a banner naming where it came from (DESIGN CANVAS: the board, canvas link and copy version; STORYBOOK: the story, its id, the commit), every difference boxed on both sides with the same number in its own colour, and a table. Writes `<out>/shots/<Board>-side-by-side.png` and `.md`. With no `--board`, every board a story shows. `board-shot` is its earlier name and still works. The story is the one in the built Storybook unless the project's `storyPage()` hook (below) draws it. The differences come from `<differences>/<Board>.json` (the `differences` setting; `<snapshot>/differences/` unless set) when there is one, else from the comparison below (only what is visible; the table says so) |
| `drawing-board layout [--board <Board>.dc.html] [--storybook <dir>] [--story-id <id>] [--width N] [--tolerance N] [--attr <attribute>] [--origin <selector>]` | Where the named landmarks sit on each board and on its story, measured from the top left of the screen at one width and in one font. A landmark is an element marked `data-landmark="name"` on the board and on the component the story draws (`--attr` names another attribute; `--origin` a selector to measure from, when the screen sits at an offset). Two boxes within `--tolerance` pixels (2 by default) are the same; each is reported as same, moved, resized, or on one side only. Writes `<out>/layout/layout.md`, and for every screen outside tolerance or with nothing marked a picture of each side (`<Board>-board.png`, `<Board>-story.png`). Advisory: it never sets an exit code. A board whose story cannot be drawn is listed as not measured |
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
| `out` | `reports/design-canvas` | Where they write: `shots/`, `layout/`, `pages/`, `compare.md` |
| `differences` | `<snapshot>/differences` | The folder holding each board's differences list, `<Board>.json`, which `annotate` reads |
| `tokens` | `tokens.json` | The tokens file under `project/` in the folder a refresh reads |
| `prototypePages` | A ticket key (`NOK-12`, `proto-tck-153`) | A case-blind regular expression matched against each page's id and name; boards on a matching page are left out |
| `tokensBoard` | None | A board that shows every token by `--name` and value, checked against the tokens |
| `themes` | None | The themes `page-shots` draws, such as `["dark", "light"]` |
| `hooks` | `<snapshot>/drawing-board.{ts,tsx,mts,mjs,js}` | The project's hook module |

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
   `"drawing-board": "npx --yes -p @tinkerbench-studio/drawing-board@0.4.0 -p playwright-core@<version> -p esbuild@<version> drawing-board"`.
   npx cannot see the project's `node_modules`, so the optional peers come with it: `playwright-core`
   for the browser commands and `esbuild` for hooks, each pinned to the project's own version. Run it
   as `npm run drawing-board -- check`. The version is pinned but not hashed, and `--yes` skips the
   prompt. A project whose CI runs `drawing-board check` may prefer a dev dependency
   (`npm install --save-dev @tinkerbench-studio/drawing-board@0.4.0`), hashed in the lockfile, at the
   cost of every `npm ci` needing the token.

3. Add a `.drawing-board` only for what differs from the conventions above. Nookivia's, for example:

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
browser half from `'@tinkerbench-studio/drawing-board/pictures'`).

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

Bump `version` in `package.json`, merge, then push the tag `v<version>`. CI tests it and publishes it
to GitHub Packages.

## The commands a project provides

The skills name steps, and `.claude/drawing-board.md` maps each step to a command, which is
`drawing-board`'s by convention. A project names its own only where it differs (uploading a picture,
say), and says so in that file.

## License

[MIT](LICENSE) © Maddie Carter-Smith
