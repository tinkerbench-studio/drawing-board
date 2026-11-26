// `drawing-board required-pictures`: the stories and pages a diff touches, and the pictures each needs, worked out
// from the project's own config (`stories`, `themes`) and its optional `pageSources()` hook. A story or page is
// touched when its file, or a file its imports reach, is in the diff. Reads files; prints nothing itself.
import { globSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'

import type { Config } from './config.ts'
import { SnapshotError } from './sample.ts'

/** A story or page the diff touches: the story's id or the page's name, and the file that made it so. */
export type Touched = { kind: 'story' | 'page'; id: string; file: string }
/** A picture a touched story or page needs, named as the uploads must be. */
export type Required = { for: string; name: string }
export type RequiredPictures = { touched: Touched[]; required: Required[] }

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.cjs', '.json', '.css', '.scss', '.mdx']
const INDEXES = EXTENSIONS.map(e => `index${e}`)
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|@import\s+(?:url\()?\s*)(['"])(\.{1,2}\/[^'"]*|\.{1,2})\1/g

const isFile = (path: string): boolean => {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * The file a relative import names: the path as written when it is a file, then with each extension, then an
 * index file in a folder. A folder never counts as the file itself, so `./pages` is `pages.tsx` when both `pages.tsx`
 * and a `pages/` folder exist, as the bundlers resolve it.
 */
export const resolveImport = (from: string, spec: string): string | undefined => {
  const base = resolve(dirname(from), spec)
  const candidates = [base, ...EXTENSIONS.map(e => base + e), ...(/\.[cm]?js$/.test(base) ? EXTENSIONS.slice(0, 3).map(e => base.replace(/\.[cm]?js$/, e)) : []), ...INDEXES.map(i => join(base, i))]
  return candidates.find(isFile)
}

const read = (file: string, root: string): string => {
  try {
    return readFileSync(file, 'utf8')
  } catch (error) {
    throw new SnapshotError(`${relative(root, file)} could not be read (${(error as Error).message}).`)
  }
}

/** The files `file` imports directly: those of its relative imports that resolve to a file (a package or an unresolved one is left out). */
const importsOf = (file: string, root: string): string[] => [...read(file, root).matchAll(IMPORT)].flatMap(m => resolveImport(file, m[2]!) ?? [])

/** The first file in `entries`, or one they import directly or through other imports, that is in `changed`; undefined when none is. */
export const reaches = (entries: readonly string[], changed: ReadonlySet<string>, root: string): string | undefined => {
  const seen = new Set<string>()
  const queue = [...entries]
  while (queue.length > 0) {
    const file = queue.shift()!
    if (seen.has(file)) continue
    seen.add(file)
    if (changed.has(file)) return file
    queue.push(...importsOf(file, root))
  }
  return undefined
}

/** The slug a title gives a picture name: `Pages/Ticket Pickup` is `pages-ticket-pickup`. */
export const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** The picture variants: each theme, or `default` when there are none, and `phone`. */
export const variants = (themes: readonly string[]): string[] => [...(themes.length > 0 ? themes : ['default']), 'phone']

/** The story files the config's globs find, by path from the project folder, with each story's id (its title slug, else its file's). */
const stories = (config: Config): { file: string; id: string }[] => {
  const skipped = new Set(['node_modules', '.git', basename(config.storybook)])
  const files = new Set(config.stories.flatMap(pattern => globSync(pattern, { cwd: config.root, exclude: (name: string) => skipped.has(basename(name)) })))
  return [...files].sort().map(file => {
    const title = /\btitle:\s*(['"`])(.+?)\1/.exec(read(join(config.root, file), config.root))?.[2]
    return { file, id: slug(title ?? file.replace(/\.[^/]+$/, '')) }
  })
}

const PREVIEW = /(^|\/)\.storybook\/preview\.[^/]+$/

/** What the diff touches and the pictures that needs. `pages` is the `pageSources()` hook's answer, none when the project has no hook. */
export const requiredPictures = (config: Config, changedPaths: readonly string[], pages: Readonly<Record<string, readonly string[]>> = {}): RequiredPictures => {
  const root = config.root
  const changed = new Set(changedPaths.map(p => resolve(root, p)))
  const everything = changedPaths.some(p => PREVIEW.test(p))
  const touched: Touched[] = []
  for (const story of stories(config)) {
    const file = everything ? join(root, story.file) : reaches([join(root, story.file)], changed, root)
    if (file !== undefined) touched.push({ kind: 'story', id: story.id, file: relative(root, file) })
  }
  for (const [page, entries] of Object.entries(pages).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const file = reaches(
      entries.map(e => resolve(root, e)),
      changed,
      root,
    )
    if (file !== undefined) touched.push({ kind: 'page', id: page, file: relative(root, file) })
  }
  const required = touched.flatMap(t => variants(config.themes).map(v => ({ for: t.id, name: `${t.kind === 'story' ? `story-${t.id}` : t.id}-${v}` })))
  return { touched, required }
}

/** The changed paths a command reads: one per line, blank lines left out. */
export const parseChanged = (text: string): string[] => text.split('\n').map(l => l.trim()).filter(l => l !== '')
