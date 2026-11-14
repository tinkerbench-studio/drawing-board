// The `@tinkerbench-studio/drawing-board/samples` entry: what a story reads from the committed snapshot. It imports
// nothing from Node, so Vite and Storybook can bundle it; the esbuild half is `…/samples/esbuild`.
import type { BoardMeta } from './snapshot.ts'

/**
 * Readers over the board metadata files. The project passes the files in because only its own module can name them:
 * `import.meta.glob` is resolved by Vite relative to the file that calls it.
 *
 * ```ts
 * export const { canvasSample, canvasHas, canvasKeys } = createCanvasSamples(
 *   import.meta.glob<BoardMeta>('./boards/*.meta.json', { eager: true, import: 'default' }),
 * )
 * ```
 *
 * A board counts only when its copy was read by a refresh (`copy` is set); one that marks nothing has no keys.
 * `options.extras` adds values by board file, which win over the board's own (a project's values that are passed to
 * an import and so are not marked on the board); a board with extras counts whether or not its copy was read.
 */
export const createCanvasSamples = (metas: Record<string, BoardMeta>, options: { extras?: Record<string, Record<string, string>> } = {}) => {
  const extras = options.extras ?? {}
  const data: Record<string, Record<string, string> | undefined> = Object.fromEntries(
    Object.values(metas)
      .filter(meta => meta.copy !== undefined || meta.file in extras)
      .map(meta => [meta.file, { ...meta.samples, ...extras[meta.file] }]),
  )
  return {
    /** The text the board shows for a `data-sample` key; throws on a key the snapshot lacks. */
    canvasSample: (board: string, key: string): string => {
      const value = data[board]?.[key]
      if (value === undefined) throw new Error(`No data-sample "${key}" in ${board}: refresh the design canvas snapshot.`)
      return value
    },
    /** The text the board shows for a key, or null when the board marks none (a value it does not draw). */
    canvasSampleOrNull: (board: string, key: string): string | null => data[board]?.[key] ?? null,
    /** Whether the board marks `key`, for a story that reads a list of marks until they run out. */
    canvasHas: (board: string, key: string): boolean => data[board]?.[key] !== undefined,
    /** The keys a board marks, in the order they appear on the board. */
    canvasKeys: (board: string): string[] => Object.keys(data[board] ?? {}),
  }
}
