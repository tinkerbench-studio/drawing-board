// The esbuild plugin that stands in for Vite's eager `import.meta.glob` of JSON files, which esbuild lacks. Node only:
// import it from `@tinkerbench-studio/drawing-board/samples/esbuild`, never into code Vite bundles for the browser.
import { globSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import type { Plugin } from 'esbuild'

/** Vite's eager `import.meta.glob('<pattern>', { eager: true, … })` of JSON files, as the object Vite would give: path → parsed JSON. */
export const expandGlobs = (source: string, dir: string): string =>
  source.replace(/import\.meta\.glob(?:<(?:[^<>()]|<(?:[^<>()]|<[^<>]*>)*>)*>)?\(\s*(['"])([^'"]+)\1\s*(?:,\s*\{[^}]*\})?\s*,?\s*\)/g, (whole, _quote: string, pattern: string) => {
    if (!pattern.endsWith('.json')) return whole
    const files = globSync(pattern, { cwd: dir }).sort()
    return `(${JSON.stringify(Object.fromEntries(files.map(f => [`./${relative(dir, join(dir, f)).replaceAll('\\', '/')}`, JSON.parse(readFileSync(join(dir, f), 'utf8'))])))})`
  })

const LOADERS = { js: 'js', jsx: 'jsx', ts: 'ts', tsx: 'tsx' } as const

/**
 * Replaces each `import.meta.glob('<pattern>.json', { eager: true, … })` in the files esbuild loads with the parsed
 * files, read at bundle time and relative to the file that calls it, as Vite would give them. A file with no such
 * call, and a glob of anything but JSON, is left as it is.
 */
export const viteJsonGlob = (): Plugin => ({
  name: 'vite-json-glob',
  setup: build =>
    build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, args => {
      const source = readFileSync(args.path, 'utf8')
      if (!source.includes('import.meta.glob')) return undefined
      const ext = args.path.match(/\.([cm]?[jt]sx?)$/)![1]!.replace(/^[cm]/, '') as keyof typeof LOADERS
      return { contents: expandGlobs(source, dirname(args.path)), loader: LOADERS[ext] }
    }),
})
