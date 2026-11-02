// Pictures for a UX change: one story from a built Storybook in each variant, and before/after images with what
// changed outlined. The pure parts are here; pictures-run.ts drives the browser.

/** A built Storybook's file types, for the server that serves it to the browser. */
export const CONTENT_TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json' }

/** The address of a story's own page (no Storybook chrome) on a server at `base`; a theme is passed as Storybook's `theme` global. */
export const storyUrl = (base: string, id: string, theme?: string): string => {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`"${id}" is not a story id (lower case letters, digits and dashes: pages-ticket--ticket-pickup); use --list to see them`)
  return `${base}/iframe.html?id=${id}&viewMode=story${theme ? `&globals=theme:${theme}` : ''}`
}

type StoryIndexJson = { entries?: Record<string, { id: string; type?: string }>; stories?: Record<string, { id: string; type?: string }> }

/** The ids of the stories (not the docs pages) in a built Storybook's index.json, sorted. */
export const storyIds = (index: StoryIndexJson): string[] =>
  Object.values(index.entries ?? index.stories ?? {})
    .filter(e => e.type !== 'docs')
    .map(e => e.id)
    .sort()

export type StoryShotOptions = { dir: string; id?: string; out?: string; width?: number; theme?: 'light' | 'dark'; list: boolean }

const STORY_SHOT_USAGE = 'Usage: drawing-board story-shot <storybook-static-dir> <story-id> <out.png> [--width N] [--theme light|dark]   or   drawing-board story-shot <storybook-static-dir> --list'

/** The options of `story-shot`: the three positional arguments (or `--list`), `--width` and `--theme`. */
export const storyShotOptions = (argv: readonly string[]): StoryShotOptions => {
  const positional: string[] = []
  const options: Omit<StoryShotOptions, 'dir'> = { list: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--list') options.list = true
    else if (a === '--width') options.width = Number(argv[++i])
    else if (a === '--theme') options.theme = argv[++i] as StoryShotOptions['theme']
    else positional.push(a)
  }
  if (options.width !== undefined && (!Number.isInteger(options.width) || options.width < 200)) throw new Error('--width is a number of pixels, 200 or more')
  if (options.theme !== undefined && options.theme !== 'light' && options.theme !== 'dark') throw new Error('--theme is light or dark')
  const [dir, id, out] = positional
  if (dir === undefined || (!options.list && (id === undefined || out === undefined))) throw new Error(STORY_SHOT_USAGE)
  return { dir, ...(id === undefined ? {} : { id }), ...(out === undefined ? {} : { out }), ...options }
}

export type Variant = { theme?: 'light' | 'dark'; width: number; out: string }

/** The pictures to take: dark, light and a 390 px phone (dark) by default, written beside `out` with the variant in the name; or just the one `--width` and `--theme` ask for, at `out`. */
export const storyVariants = ({ width, theme }: Pick<StoryShotOptions, 'width' | 'theme'>, out: string): Variant[] => {
  if (width === undefined && theme === undefined)
    return [
      { theme: 'dark', width: 1100, out: out.replace(/(\.png)?$/, '-dark.png') },
      { theme: 'light', width: 1100, out: out.replace(/(\.png)?$/, '-light.png') },
      { theme: 'dark', width: 390, out: out.replace(/(\.png)?$/, '-phone.png') },
    ]
  return [{ ...(theme === undefined ? {} : { theme }), width: width ?? 1100, out }]
}

/** The pictures to compare: those in both folders, paired by name; a picture in only one folder is skipped. */
export const pairPictures = (before: readonly string[], after: readonly string[]): string[] => before.filter(f => f.endsWith('.png') && after.includes(f)).sort()

/** The file a pair's before/after image is written to. */
export const compareFile = (png: string): string => `${png.replace(/\.png$/, '')}-before-after.png`

export type CompareOptions = { before: string; after: string; out: string; fromX: number; left: string; right: string }

/** The options of `compare-pictures`: the two folders and the output folder, the columns to leave out (`--from-x`), and the banners' labels (`--left`, `--right`). */
export const compareOptions = (argv: readonly string[]): CompareOptions => {
  const positional: string[] = []
  const flags: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--from-x' || a === '--left' || a === '--right') flags[a.slice(2)] = argv[++i] ?? ''
    else positional.push(a)
  }
  const [before, after, out] = positional
  if (before === undefined || after === undefined || out === undefined) throw new Error('Usage: drawing-board compare-pictures <before-dir> <after-dir> <out-dir> [--from-x N] [--left BEFORE] [--right AFTER]')
  const fromX = Number(flags['from-x'] ?? 0)
  if (!Number.isInteger(fromX) || fromX < 0) throw new Error('--from-x is a number of pixels, 0 or more')
  return { before, after, out, fromX, left: flags.left || 'BEFORE', right: flags.right || 'AFTER' }
}

/** What a pair's banner says about it. */
export const changeNote = (regions: number): string => (regions === 0 ? 'no visible change' : `${regions} region${regions === 1 ? '' : 's'} changed, outlined in red`)
