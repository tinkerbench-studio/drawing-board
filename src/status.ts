// `drawing-board status --from <folder>`: a folder read from the canvas against the committed snapshot, before a
// refresh, so the person refreshing sees what changed. It never writes; cli.ts reads the files. Pure.
import { join } from 'node:path'

import { DS_ASSUMPTION, filesInUse, unreadBound } from './check.ts'
import type { Limits } from './config.ts'
import { SnapshotError } from './sample.ts'
import { boardsOf, copyHash, countCanvasFiles, designSystemsOf, unrecordedBoards, type ArtifactRecord, type BoardMeta } from './snapshot.ts'

/** What differs between a canvas read and its snapshot, and the report `status` prints. */
export type CanvasStatus = {
  /** Boards on the canvas, outside prototype pages, with no meta file. */
  added: string[]
  /** Meta files of boards no longer on the canvas (outside prototype pages). */
  removed: string[]
  /** Boards whose page on the canvas is not the one their meta file records. */
  moved: { file: string; snapshot: string | null; canvas: string | null }[]
  /** Boards with a copy whose canvas text no longer has the recorded hash. */
  changed: string[]
  /** Boards with a copy that the folder does not hold, so they were not compared. */
  unread: string[]
  /** The files the canvas holds against the limit: every board canvas.json lists, canvas.json, the tokens and the other files read; a lower bound when an installed design system's files were not read. */
  files: { line: string; warning: boolean }
  /** Design systems installed on the canvas against the record and against the project's `designSystems`. */
  designSystems: string[]
  /** What the count assumes, when the canvas has design systems installed. */
  assumption?: string
  /** The report, a line each, without the files line. */
  lines: string[]
}

const shown = (value: string | null | undefined) => value ?? 'none'

/**
 * The canvas read (`read` gives the text of a path under `<from>/project`, undefined when it is missing; `paths` are
 * the files under it, and `tokens` the tokens file's path there) against the snapshot's meta files and record.
 * Refuses a folder with no canvas.json.
 */
export const canvasStatus = (input: { from: string; read: (path: string) => string | undefined; paths: readonly string[]; tokens: string; metas: readonly BoardMeta[]; prototype: RegExp; limits: Limits; record: ArtifactRecord; expected?: Record<string, string> }): CanvasStatus => {
  const canvasText = input.read('canvas.json')
  if (canvasText === undefined) throw new SnapshotError(`${join(input.from, 'project', 'canvas.json')} was not found: read the canvas into ${input.from} first.`)
  let canvas: unknown
  try {
    canvas = JSON.parse(canvasText)
  } catch {
    throw new SnapshotError(`${join(input.from, 'project', 'canvas.json')} is not JSON.`)
  }
  const boards = boardsOf(canvas, input.prototype)
  const onCanvas = new Map(boards.map(b => [b.file, b]))
  const metas = new Map(input.metas.map(m => [m.file, m]))
  const added = unrecordedBoards([...onCanvas.keys()], [...metas.keys()])
  const removed = [...metas.keys()].filter(file => !onCanvas.has(file)).sort()
  const moved = boards.flatMap(b => (metas.has(b.file) && metas.get(b.file)!.page !== b.page ? [{ file: b.file, snapshot: metas.get(b.file)!.page, canvas: b.page }] : [])).sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
  const copied = input.metas.filter(m => m.copy !== undefined && onCanvas.has(m.file))
  const unread = copied.filter(m => input.read(m.file) === undefined).map(m => m.file)
  const changed = copied.filter(m => input.read(m.file) !== undefined && copyHash(input.read(m.file)!) !== m.copy!.hash).map(m => m.file)
  const installed = designSystemsOf(canvas)
  const recorded = input.record.designSystems ?? {}
  const designSystems = [
    ...[...new Set([...Object.keys(installed), ...Object.keys(recorded)])].sort().flatMap(ns => (installed[ns] === recorded[ns] ? [] : [`design system "${ns}": ${shown(installed[ns])} on the canvas, ${shown(recorded[ns])} in artifact.json: refresh to record it.`])),
    ...Object.entries(input.expected ?? {}).flatMap(([ns, version]) => (installed[ns] === version ? [] : [installed[ns] === undefined ? `design system "${ns}": not installed, expected ${version}: install it on the canvas, then refresh.` : `design system "${ns}": installed ${installed[ns]}, expected ${version}: install it again on the canvas, then refresh.`])),
  ]
  const lines = [
    ...(added.length > 0 ? [`On the canvas with no meta file: ${added.join(', ')}. A full refresh adds them, or name them with --boards.`] : []),
    ...(removed.length > 0 ? [`In the snapshot but no longer on the canvas: ${removed.join(', ')}. A full refresh removes them.`] : []),
    ...moved.map(m => `${m.file} is on the page ${shown(m.canvas)} on the canvas, ${shown(m.snapshot)} in the snapshot.`),
    ...(changed.length > 0 ? [`Changed on the canvas since the snapshot's copy: ${changed.join(', ')}.`] : []),
    ...(unread.length > 0 ? [`Not in the folder, so not compared: ${unread.join(', ')}.`] : []),
    ...designSystems,
  ]
  const count = countCanvasFiles(canvas, input.tokens, input.paths)
  const files = filesInUse({ used: count.files, limits: input.limits, ...(count.unread.length === 0 ? {} : { bound: unreadBound(count.unread) }) })
  return { added, removed, moved, changed, unread, files, designSystems, ...(Object.keys(installed).length === 0 ? {} : { assumption: DS_ASSUMPTION }), lines: lines.length > 0 ? lines : ['The snapshot is in step with the canvas read.'] }
}
