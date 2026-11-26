// A project's hooks: the pieces only it can supply, in one module found by convention at
// `<snapshot>/drawing-board.{ts,tsx,mts,mjs,js}` (or the `hooks` setting). The package's commands call them:
// `check` adds what `checks()` returns to its own problems, and `page-shots` shoots what `pages()` returns. The
// module is bundled with esbuild (an optional peer dependency) into the project's node_modules/.cache, so its
// imports resolve against the project's own packages, with JSX and Vite's eager `import.meta.glob` of JSON files.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { Config } from './config.ts'
import { expandGlobs, viteJsonGlob } from './glob-plugin.ts'
import { project } from './project.ts'
import { SnapshotError } from './sample.ts'

/** What a project's hooks get: its config (`root` is the project folder; a bundled hook's own import.meta.url is not) and its snapshot on disk. */
export type HookContext = { config: Config; canvas: ReturnType<typeof project> }

/** A page to shoot: its whole HTML document, or that with the width to draw it at and CSS to add before the shot. */
export type PageShot = string | { html: string; width?: number; css?: string }

/**
 * A story the project draws itself: a whole HTML document (relative URLs in it resolve against `assets`, a folder served
 * at the page's root, when set). `annotate` and `layout` use it in place of a story from the built Storybook.
 */
export type StoryPage = { html: string; assets?: string; /** A selector to wait for before shooting. */ ready?: string }

/** Which story is wanted: the board, the story title its map entry names, and that entry's full-page export, if any. */
export type StoryRequest = { board: string; story: string; page?: string }

export type Hooks = {
  /** More problems for `drawing-board check`, as lines; empty when the project's own rules hold. */
  checks?: (context: HookContext) => readonly string[] | Promise<readonly string[]>
  /** How a story is served: the page to draw beside a board. Return undefined to use the built Storybook. */
  storyPage?: (context: HookContext & StoryRequest) => StoryPage | undefined | Promise<StoryPage | undefined>
  /** The pages `drawing-board page-shots` shoots, by name. */
  pages?: (context: HookContext) => Record<string, PageShot> | Promise<Record<string, PageShot>>
  /** The entry files of each page, from the project folder, for `drawing-board required-pictures`: a page is touched when what its entries import reaches a changed file. */
  pageSources?: (context: HookContext) => Record<string, readonly string[]> | Promise<Record<string, readonly string[]>>
}

export const HOOK_NAMES = ['drawing-board.ts', 'drawing-board.tsx', 'drawing-board.mts', 'drawing-board.mjs', 'drawing-board.js']

/** The project's hook module, if it has one: the `hooks` setting, else the first conventional name in the snapshot folder. */
export const hookModule = (config: Config): string | undefined => {
  if (config.hooks !== undefined) {
    if (!existsSync(config.hooks)) throw new SnapshotError(`The hooks module ${config.hooks} (the "hooks" setting) does not exist.`)
    return config.hooks
  }
  return HOOK_NAMES.map(name => join(config.snapshot, name)).find(existsSync)
}

export { expandGlobs }

/** The project's hooks, bundled and loaded; none when it has no hook module. */
export const loadHooks = async (config: Config): Promise<Hooks> => {
  const module = hookModule(config)
  if (module === undefined) return {}
  let esbuild: typeof import('esbuild')
  try {
    esbuild = await import('esbuild')
  } catch {
    throw new SnapshotError(`${relative(config.root, module)} needs esbuild to load: npm install --save-dev esbuild.`)
  }
  const cache = join(config.root, 'node_modules/.cache/drawing-board')
  mkdirSync(cache, { recursive: true })
  const outfile = join(cache, `hooks-${createHash('sha256').update(module).digest('hex').slice(0, 12)}-${Date.now()}.mjs`)
  await esbuild.build({
    entryPoints: [module],
    outfile,
    absWorkingDir: config.root,
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    jsx: 'automatic',
    logLevel: 'error',
    plugins: [
      viteJsonGlob(),
    ],
  })
  try {
    return (await import(pathToFileURL(resolve(outfile)).href)) as Hooks
  } finally {
    // Once imported, the bundle is not read again: leave nothing behind.
    rmSync(outfile, { force: true })
  }
}
