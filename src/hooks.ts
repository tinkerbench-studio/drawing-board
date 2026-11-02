// A project's hooks: the pieces only it can supply, in one module found by convention at
// `<snapshot>/drawing-board.{ts,tsx,mts,mjs,js}` (or the `hooks` setting). The package's commands call them:
// `check` adds what `checks()` returns to its own problems, and `page-shots` shoots what `pages()` returns. The
// module is bundled with esbuild (an optional peer dependency) into the project's node_modules/.cache, so its
// imports resolve against the project's own packages, with JSX and Vite's eager `import.meta.glob` of JSON files.
import { createHash } from 'node:crypto'
import { existsSync, globSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { Config } from './config.ts'
import { project } from './project.ts'
import { SnapshotError } from './sample.ts'

/** What a project's hooks get: its config (`root` is the project folder; a bundled hook's own import.meta.url is not) and its snapshot on disk. */
export type HookContext = { config: Config; canvas: ReturnType<typeof project> }

/** A page to shoot: its whole HTML document, or that with the width to draw it at and CSS to add before the shot. */
export type PageShot = string | { html: string; width?: number; css?: string }

export type Hooks = {
  /** More problems for `drawing-board check`, as lines; empty when the project's own rules hold. */
  checks?: (context: HookContext) => readonly string[] | Promise<readonly string[]>
  /** The pages `drawing-board page-shots` shoots, by name. */
  pages?: (context: HookContext) => Record<string, PageShot> | Promise<Record<string, PageShot>>
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

/** Vite's eager `import.meta.glob('<pattern>', { eager: true, … })` of JSON files, as the object Vite would give: path → parsed JSON. */
export const expandGlobs = (source: string, dir: string): string =>
  source.replace(/import\.meta\.glob(?:<[^>()]*>)?\(\s*(['"])([^'"]+)\1\s*(?:,\s*\{[^}]*\})?\s*\)/g, (whole, _quote: string, pattern: string) => {
    if (!pattern.endsWith('.json')) return whole
    const files = globSync(pattern, { cwd: dir }).sort()
    return `(${JSON.stringify(Object.fromEntries(files.map(f => [`./${relative(dir, join(dir, f)).replaceAll('\\', '/')}`, JSON.parse(readFileSync(join(dir, f), 'utf8'))])))})`
  })

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
      {
        name: 'vite-json-glob',
        setup: build =>
          build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, args => {
            const source = readFileSync(args.path, 'utf8')
            if (!source.includes('import.meta.glob')) return undefined
            const ext = args.path.match(/\.([cm]?[jt]sx?)$/)![1]!.replace(/^[cm]/, '') as 'js' | 'jsx' | 'ts' | 'tsx'
            return { contents: expandGlobs(source, dirname(args.path)), loader: ext }
          }),
      },
    ],
  })
  try {
    return (await import(pathToFileURL(resolve(outfile)).href)) as Hooks
  } finally {
    // Once imported, the bundle is not read again: leave nothing behind.
    rmSync(outfile, { force: true })
  }
}
