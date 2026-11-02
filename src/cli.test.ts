// The CLI end to end, on a throwaway project: a full refresh, a partial one, the check and the index.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const cli = fileURLToPath(new URL('./cli.ts', import.meta.url))
const write = (dir: string, path: string, text: string) => {
  mkdirSync(join(dir, path, '..'), { recursive: true })
  writeFileSync(join(dir, path), text)
}
const run = (cwd: string, args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' })
const board = (sample: string) => `<b data-sample="a.v">${sample}</b>`
const canvas = (w: number) => JSON.stringify({ pages: [{ id: 'main' }, { id: 'p', name: 'NOK-9' }], boards: { 'A.dc.html': { w: 1, h: 1, page: 'main' }, 'B.dc.html': { w, h: 1, page: 'main' }, 'C.dc.html': { w, h: 1, page: 'main' }, 'Proto.dc.html': { w: 1, h: 1, page: 'p' } } })

/** A project with a config, two stories and boards A, B (shown by stories) and C, and a canvas read of it. */
const fixture = () => {
  const dir = mkdtempSync(join(tmpdir(), 'drawing-board-project-'))
  const from = mkdtempSync(join(tmpdir(), 'drawing-board-read-'))
  write(dir, 'drawing-board.config.json', JSON.stringify({ artifact: 'https://claude.ai/artifact/x', snapshot: 'canvas', stories: ['stories/*.stories.tsx'] }))
  write(dir, 'stories/a.stories.tsx', "export default { title: 'L/A' }")
  write(dir, 'stories/b.stories.tsx', 'export default { title: "L/B" }')
  write(dir, 'canvas/boards/A.map.json', '{"story":"L/A"}')
  write(dir, 'canvas/boards/B.map.json', '{"story":"L/B"}')
  write(dir, 'canvas/boards/C.map.json', '{"none":"a spec"}')
  write(from, 'project/canvas.json', canvas(1))
  write(from, 'project/tokens.json', '{"color":{"tokens":[{"name":"ink","value":"#000"}]}}')
  write(from, 'project/A.dc.html', board('old'))
  write(from, 'project/B.dc.html', board('old'))
  write(from, 'artifact-type/dc-runtime.js', '// runtime')
  return { dir, from }
}
const boards = (dir: string) => Object.fromEntries(readdirSync(join(dir, 'canvas/boards')).map(n => [n, readFileSync(join(dir, 'canvas/boards', n), 'utf8')]))

describe('drawing-board', () => {
  it('refreshes the whole snapshot, then the check passes', () => {
    const { dir, from } = fixture()
    const snap = run(dir, ['snapshot', '--from', from, '--version', 'v1'])
    expect(snap.stderr).toBe('')
    expect(snap.stdout).toMatch(/3 boards, 2 copied/)
    expect(Object.keys(boards(dir)).sort()).toEqual(['A.dc.html', 'A.map.json', 'A.meta.json', 'B.dc.html', 'B.map.json', 'B.meta.json', 'C.map.json', 'C.meta.json', 'support.js'])
    expect(JSON.parse(readFileSync(join(dir, 'canvas/story-index.json'), 'utf8'))).toEqual({ 'L/A': ['A.dc.html'], 'L/B': ['B.dc.html'] })
    const check = run(dir, ['check'])
    expect(check.stderr).toBe('')
    expect(check.status).toBe(0)
  })

  it("refreshes only the named boards and leaves every other board's files byte for byte", () => {
    const { dir, from } = fixture()
    run(dir, ['snapshot', '--from', from, '--version', 'v1'])
    const before = boards(dir)
    write(from, 'project/canvas.json', canvas(9))
    write(from, 'project/A.dc.html', board('new'))
    write(from, 'project/B.dc.html', board('moved on'))
    const partial = run(dir, ['snapshot', '--from', from, '--version', 'v2', '--boards', 'A.dc.html'])
    expect(partial.stderr).toBe('')
    const after = boards(dir)
    for (const name of ['B.dc.html', 'B.meta.json', 'C.meta.json', 'support.js']) expect(after[name], name).toBe(before[name])
    expect(after['A.dc.html']).toBe(board('new'))
    expect(JSON.parse(after['A.meta.json']!).copy.version).toBe('v2')
    expect(run(dir, ['check']).status).toBe(0)
  })

  it('fails the check on a hand-edited copy, a missing story or a stale index, and names each', () => {
    const { dir, from } = fixture()
    run(dir, ['snapshot', '--from', from, '--version', 'v1'])
    write(dir, 'canvas/boards/A.dc.html', board('edited'))
    write(dir, 'canvas/boards/B.map.json', '{"story":"L/Gone"}')
    const check = run(dir, ['check'])
    expect(check.status).toBe(1)
    expect(check.stderr).toMatch(/A\.dc\.html: boards\/A\.dc\.html differs from the copy the last refresh recorded/)
    expect(check.stderr).toMatch(/B\.dc\.html: the story "L\/Gone" does not exist/)
    expect(check.stderr).toMatch(/story-index\.json/)
    expect(run(dir, ['index']).status).toBe(0)
    expect(run(dir, ['check']).stderr).not.toMatch(/story-index\.json/)
  })

  it('refuses, writing nothing, a refresh that names a board the canvas lacks, and a project with no config', () => {
    const { dir, from } = fixture()
    const refused = run(dir, ['snapshot', '--from', from, '--version', 'v1', '--boards', 'Z.dc.html'])
    expect(refused.status).toBe(1)
    expect(refused.stderr).toMatch(/Z\.dc\.html is named to refresh but is not on the canvas/)
    expect(Object.keys(boards(dir)).sort()).toEqual(['A.map.json', 'B.map.json', 'C.map.json'])
    const bare = mkdtempSync(join(tmpdir(), 'drawing-board-bare-'))
    expect(run(bare, ['check']).stderr).toMatch(/drawing-board\.config\.json was not found/)
    expect(run(bare, ['nonsense']).status).toBe(2)
  })
})
