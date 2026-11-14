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
 */
export const createCanvasSamples = (metas: Record<string, BoardMeta>) => {
  const data: Record<string, Record<string, string> | undefined> = Object.fromEntries(
    Object.values(metas)
      .filter(meta => meta.copy !== undefined)
      .map(meta => [meta.file, meta.samples ?? {}]),
  )
  return {
    /** The text the board shows for a `data-sample` key; throws on a key the snapshot lacks. */
    canvasSample: (board: string, key: string): string => {
      const value = data[board]?.[key]
      if (value === undefined) throw new Error(`No data-sample "${key}" in ${board}: refresh the design canvas snapshot.`)
      return value
    },
    /** Whether the board marks `key`, for a story that reads a list of marks until they run out. */
    canvasHas: (board: string, key: string): boolean => data[board]?.[key] !== undefined,
    /** The keys a board marks, in the order they appear on the board. */
    canvasKeys: (board: string): string[] => Object.keys(data[board] ?? {}),
  }
}
