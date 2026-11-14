// The CLI end to end, on a throwaway project: a full refresh, a partial one, the check and the index.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, type Dirent } from 'node:fs'
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
  write(dir, '.drawing-board', JSON.stringify({ artifact: 'https://claude.ai/artifact/x', snapshot: 'canvas' }))
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
    expect(run(bare, ['snapshot', '--from', bare, '--version', 'v1']).stderr).toMatch(/No canvas link yet: set "artifact" in drawing-board.config.json \(or .drawing-board\)/)
    expect(run(bare, ['nonsense']).status).toBe(2)
  })
})

describe('drawing-board check, with the optional checks', () => {
  /** A refreshed project whose committed copy of A is then hand-edited to break each optional check (the hash check also fails; the tests look for the lines they name). */
  const broken = (configFile: string) => {
    const { dir, from } = fixture()
    run(dir, ['snapshot', '--from', from, '--version', 'v1'])
    write(dir, '.drawing-board', '')
    write(dir, configFile, JSON.stringify({ artifact: 'https://claude.ai/artifact/x', snapshot: 'canvas', checks: { repeatedSampleKeys: true, outlineSelectors: true, passedSamples: true, tokenThemes: true, tokensCss: ['src/*.css'] } }))
    write(dir, 'canvas/boards/A.dc.html', '<b data-sample="a.v">1</b><dc-import data-sample-n="a.b">')
    write(dir, 'canvas/boards/A.map.json', JSON.stringify({ story: 'L/A', outline: { board: ['.nope'] } }))
    write(dir, 'canvas/tokens.json', JSON.stringify({ color: { themes: [{ id: 'dark' }], tokens: [{ name: 'ink', value: '#000', values: {} }] } }))
    write(dir, 'src/site.css', ':root{--ink:#111}')
    return dir
  }
  it.each(['drawing-board.config.json', '.drawing-board'])('runs each turned-on check from %s and names each problem', file => {
    const check = run(broken(file), ['check'])
    expect(check.status).toBe(1)
    for (const line of ['A.dc.html: outline ".nope" names nothing on the board.', 'A.dc.html: data-sample="a.b" names the prop "n"', 'tokens.json: colour "ink" has no dark value.', 'colour "ink" is #000 on the canvas but --ink is #111 in the CSS.']) expect(check.stderr, line).toContain(line)
  })
  it('says a repeated key on its own, before the snapshot comparison would refuse it', () => {
    const dir = broken('drawing-board.config.json')
    write(dir, 'canvas/boards/A.dc.html', '<b data-sample="a.v">1</b><b data-sample="a.v">1</b>')
    const check = run(dir, ['check'])
    expect(check.status).toBe(1)
    expect(check.stderr).toContain('A.dc.html: data-sample "a.v" is used more than once')
    expect(check.stderr).not.toContain('is used twice')
  })
  it('runs none of them when none is turned on', () => {
    const dir = broken('drawing-board.config.json')
    write(dir, 'drawing-board.config.json', JSON.stringify({ artifact: 'https://claude.ai/artifact/x', snapshot: 'canvas' }))
    const { stderr } = run(dir, ['check'])
    for (const text of ['used more than once', 'names nothing on the board', 'names the prop', 'has no dark value', 'in the CSS']) expect(stderr, text).not.toContain(text)
  })
  it('says when the stylesheet globs find nothing', () => {
    const dir = broken('drawing-board.config.json')
    write(dir, 'drawing-board.config.json', JSON.stringify({ artifact: 'https://claude.ai/artifact/x', snapshot: 'canvas', checks: { tokensCss: ['nowhere/*.css'] } }))
    expect(run(dir, ['check']).stderr).toContain('checks.tokensCss: nowhere/*.css found no stylesheet.')
  })
})

describe('the picture commands', () => {
  it('run with no config, and say how to call them when the arguments are missing', () => {
    const bare = mkdtempSync(join(tmpdir(), 'drawing-board-bare-'))
    const compare = run(bare, ['compare-pictures', 'only-one'])
    expect(compare.status).toBe(1)
    expect(compare.stderr).toMatch(/Usage: drawing-board compare-pictures/)
    const shot = run(bare, ['story-shot', bare, '--list'])
    expect(shot.status).toBe(1)
    expect(shot.stderr).toMatch(/not a built Storybook/)
  })

  it('know annotate (and its earlier name board-shot) and layout, and refuse a bad flag naming it', () => {
    const bare = mkdtempSync(join(tmpdir(), 'drawing-board-bare-'))
    for (const command of ['annotate', 'board-shot']) expect(run(bare, [command, '--board', 'Main']).stderr).toMatch(/--board names a board file/)
    const layout = run(bare, ['layout', '--board', 'Main'])
    expect(layout.status).toBe(1)
    expect(layout.stderr).toMatch(/--board names a board file/)
    expect(run(bare, ['layout', '--width', '5']).stderr).toMatch(/--width is a number, 200 or more/)
  })
})

describe('the record, artifact.json', () => {
  const record = (dir: string, folder = 'canvas') => JSON.parse(readFileSync(join(dir, folder, 'artifact.json'), 'utf8'))

  it('is written by a full refresh with the canvas, versions, file count, boards and design systems', () => {
    const { dir, from } = fixture()
    write(from, 'project/canvas.json', JSON.stringify({ ...JSON.parse(canvas(1)), designSystems: [{ title: 'Acme', namespace: 'acme', version: '3', artifact: 'a', copiedAt: 't' }, { title: 'broken' }] }))
    write(from, 'project/ds/acme/button.js', '//')
    run(dir, ['snapshot', '--from', from, '--version', 'v1'])
    expect(readFileSync(join(dir, 'canvas/artifact.json'), 'utf8')).toBe(JSON.stringify({ canvas: 'main', artifact: 'https://claude.ai/artifact/x', version: 'v1', fullVersion: 'v1', files: 7, canvasBoards: 4, boards: ['A.dc.html', 'B.dc.html', 'C.dc.html'], designSystems: { acme: '3' } }, null, 2) + '\n')
  })

  it('keeps the full version on a partial refresh, and names the boards it did not add, never a prototype', () => {
    const { dir, from } = fixture()
    run(dir, ['snapshot', '--from', from, '--version', 'v1'])
    write(from, 'project/canvas.json', JSON.stringify({ ...JSON.parse(canvas(1)), boards: { ...JSON.parse(canvas(1)).boards, 'D.dc.html': { w: 1, h: 1, page: 'main' }, 'E.dc.html': { w: 1, h: 1, page: 'main' } } }))
    const partial = run(dir, ['snapshot', '--from', from, '--version', 'v2', '--boards', 'A.dc.html,E.dc.html'])
    expect(partial.stdout).toContain('On the canvas but not in the snapshot, and not named: D.dc.html. A full refresh adds them.')
    expect(partial.stdout).not.toContain('Proto.dc.html')
    expect(record(dir)).toMatchObject({ version: 'v2', fullVersion: 'v1', boards: ['A.dc.html', 'B.dc.html', 'C.dc.html', 'D.dc.html', 'E.dc.html'] })
    const check = run(dir, ['check'])
    expect(check.status).toBe(1)
    expect(check.stderr).toContain('warning: D.dc.html is on the canvas (artifact.json) but has no meta file: a full refresh adds it.')
  })

  it('leaves out the full version after a partial refresh of an old record, and an old record still checks', () => {
    const { dir, from } = fixture()
    run(dir, ['snapshot', '--from', from, '--version', 'v1'])
    write(dir, 'canvas/artifact.json', '{"artifact":"https://claude.ai/artifact/x"}')
    const old = run(dir, ['check'])
    expect(old.status).toBe(0)
    expect(old.stdout).toContain('Canvas files: at least 5 of 512 in use, at most 507 free: artifact.json records no file count')
    run(dir, ['snapshot', '--from', from, '--version', 'v2', '--boards', 'A.dc.html'])
    expect(record(dir).fullVersion).toBeUndefined()
    expect(record(dir).version).toBe('v2')
  })

  it('fails the check when the record is of another canvas or link', () => {
    const { dir, from } = fixture()
    run(dir, ['snapshot', '--from', from, '--version', 'v1'])
    write(dir, 'canvas/artifact.json', JSON.stringify({ ...record(dir), canvas: 'reference', artifact: 'https://claude.ai/artifact/other' }))
    const check = run(dir, ['check'])
    expect(check.status).toBe(1)
    expect(check.stderr).toContain('artifact.json is the record of the canvas "reference", but this snapshot is the canvas "main"')
    expect(check.stderr).toContain('artifact.json records the canvas https://claude.ai/artifact/other, but the config names https://claude.ai/artifact/x')
  })
})

describe('the file count', () => {
  const record = (dir: string) => JSON.parse(readFileSync(join(dir, 'canvas/artifact.json'), 'utf8'))

  it('records the design systems whose files were not read, and check then says at least', () => {
    const { dir, from } = fixture()
    write(from, 'project/canvas.json', JSON.stringify({ ...JSON.parse(canvas(1)), designSystems: [{ namespace: 'acme', version: '3' }] }))
    const snap = run(dir, ['snapshot', '--from', from, '--version', 'v1'])
    expect(snap.stdout).toContain('The canvas holds at least 6 files: no files of the design system acme under project/ds/ were read')
    expect(snap.stdout).toContain('The count assumes every file under project/ds/<namespace>/ was read when any of it was')
    expect(record(dir)).toMatchObject({ files: 6, canvasBoards: 4, unread: ['acme'] })
    const check = run(dir, ['check'])
    expect(check.status).toBe(0)
    expect(check.stdout).toContain('Canvas files: at least 6 of 512 in use, at most 506 free (canvas version v1): no files of the design system acme under project/ds/ were read')
  })

  it('floors a partial refresh that adds a board, from a read with fewer files, on the last full count', () => {
    const { dir, from } = fixture()
    const withD = (boards: object) => JSON.stringify({ ...JSON.parse(canvas(1)), designSystems: [{ namespace: 'acme', version: '3' }], boards })
    write(from, 'project/canvas.json', withD(JSON.parse(canvas(1)).boards))
    for (let n = 0; n < 30; n++) write(from, `project/ds/acme/f${n}.js`, '//')
    write(from, 'project/logo.png', 'png')
    run(dir, ['snapshot', '--from', from, '--version', 'v1'])
    expect(record(dir)).toMatchObject({ files: 37, canvasBoards: 4 })
    expect(record(dir).unread).toBeUndefined()
    // A fold-in adds D; the read for it holds one of the 30 design system files and not the image.
    const small = mkdtempSync(join(tmpdir(), 'drawing-board-small-'))
    write(small, 'project/canvas.json', withD({ ...JSON.parse(canvas(1)).boards, 'D.dc.html': { w: 1, h: 1, page: 'main' } }))
    write(small, 'project/tokens.json', readFileSync(join(from, 'project/tokens.json'), 'utf8'))
    write(small, 'project/ds/acme/f0.js', '//')
    write(dir, 'canvas/boards/D.map.json', '{"none":"later"}')
    run(dir, ['snapshot', '--from', small, '--version', 'v2', '--boards', 'D.dc.html'])
    expect(record(dir)).toMatchObject({ version: 'v2', files: 38, canvasBoards: 5 })
    expect(run(dir, ['check']).stdout).toContain('Canvas files: 38 of 512 in use, 474 free (canvas version v2).')
  })

  it('stores the count as counted on the first partial refresh after an old record', () => {
    const { dir, from } = fixture()
    run(dir, ['snapshot', '--from', from, '--version', 'v1'])
    write(dir, 'canvas/artifact.json', JSON.stringify({ artifact: 'https://claude.ai/artifact/x', files: 50 }))
    const partial = run(dir, ['snapshot', '--from', from, '--version', 'v2', '--boards', 'A.dc.html'])
    expect(partial.status).toBe(0)
    expect(record(dir)).toMatchObject({ files: 6, canvasBoards: 4 })
  })
})

describe('the main canvas settings', () => {
  it('hold only the main canvas to the tokens board and the token checks', () => {
    const { dir, from } = fixture()
    write(from, 'project/A.dc.html', '<b data-sample="a.v">--ink #000</b>')
    write(dir, 'src/site.css', ':root{--ink:#000}')
    write(dir, 'drawing-board.config.json', JSON.stringify({ tokensBoard: 'A.dc.html', checks: { tokenThemes: true, tokensCss: ['src/*.css'] }, canvases: [{ id: 'main', role: 'main', artifact: 'https://claude.ai/artifact/x', snapshot: 'canvas' }, { id: 'ref', role: 'reference', artifact: 'https://claude.ai/artifact/r', snapshot: 'reference' }] }))
    const ref = mkdtempSync(join(tmpdir(), 'drawing-board-reference-'))
    write(dir, 'reference/boards/Arch.map.json', '{"none":"architecture"}')
    write(ref, 'project/canvas.json', JSON.stringify({ boards: { 'Arch.dc.html': { w: 1, h: 1, page: 'arch' } } }))
    write(ref, 'project/tokens.json', '{}')
    write(ref, 'artifact-type/dc-runtime.js', '// runtime')
    run(dir, ['snapshot', '--from', from, '--version', 'v1'])
    run(dir, ['snapshot', '--from', ref, '--version', 'r1', '--canvas', 'ref'])
    const check = run(dir, ['check'])
    expect(check.stderr).toBe('')
    expect(check.status).toBe(0)
    write(from, 'project/A.dc.html', board('no tokens'))
    run(dir, ['snapshot', '--from', from, '--version', 'v2'])
    const failing = run(dir, ['check'])
    expect(failing.stderr).toContain('[main] token --ink is in tokens.json but the tokens board does not show it.')
    expect(failing.stderr).not.toContain('[ref]')
  })
})

describe('--canvas', () => {
  it('is refused with no id, before another flag, or written --canvas=<id>, and find keeps every word', () => {
    const { dir, from } = fixture()
    run(dir, ['snapshot', '--from', from, '--version', 'v1'])
    expect(run(dir, ['snapshot', '--from', from, '--version', 'v2', '--canvas']).stderr).toContain('--canvas names no canvas')
    expect(run(dir, ['check', '--canvas', '--config', 'x']).stderr).toContain('--canvas names no canvas')
    const equals = run(dir, ['snapshot', '--canvas=ref', '--from', from, '--version', 'v2'])
    expect(equals.status).toBe(1)
    expect(equals.stderr).toContain('Write --canvas <id>, with a space')
    expect(run(dir, ['find', '--canvas=main', 'A']).stderr).toContain('Write --canvas <id>')
    expect(run(dir, ['find', 'A.dc', '--canvas', 'main', 'C.dc']).stdout).toBe('main  main  A.dc.html  L/A\nmain  main  C.dc.html  no story\n')
    expect(run(dir, ['find', '--tokens', 'C.dc']).stdout).toBe('main  main  C.dc.html  no story\n')
  })
})

describe('the warnings', () => {
  const refreshed = (settings: object = {}) => {
    const { dir, from } = fixture()
    run(dir, ['snapshot', '--from', from, '--version', 'v1'])
    write(dir, 'drawing-board.config.json', JSON.stringify({ artifact: 'https://claude.ai/artifact/x', snapshot: 'canvas', ...settings }))
    return { dir, from }
  }

  it('say the files in use as information when there is room', () => {
    const check = run(refreshed().dir, ['check'])
    expect(check.stdout).toBe('The design canvas snapshot is in step.\nCanvas files: 6 of 512 in use, 506 free (canvas version v1).\n')
    expect(check.stderr).toBe('')
  })

  it('warn when few files are free, or none, after the in-step line, and never fail the check', () => {
    const low = run(refreshed({ limits: { files: 10, headroom: 8 } }).dir, ['check'])
    expect(low.status).toBe(0)
    expect(low.stdout).toBe('The design canvas snapshot is in step.\n')
    expect(low.stderr).toMatch(/^warning: Canvas files: 6 of 10 in use, 4 free \(canvas version v1\)\. Fewer than 8 are free/)
    const full = run(refreshed({ limits: { files: 6 } }).dir, ['check'])
    expect(full.status).toBe(0)
    expect(full.stderr).toMatch(/^warning: Canvas files: 6 of 6 in use, 0 free \(canvas version v1\)\. The canvas is full/)
  })

  it('warn about a lower bound that leaves few free', () => {
    const { dir } = refreshed({ limits: { files: 20 } })
    write(dir, 'canvas/artifact.json', '{"artifact":"https://claude.ai/artifact/x"}')
    const check = run(dir, ['check'])
    expect(check.status).toBe(0)
    expect(check.stderr).toContain('warning: Canvas files: at least 5 of 20 in use, at most 15 free: artifact.json records no file count')
  })

  it('warn about a design system at another version than the setting, after the problems', () => {
    const { dir } = refreshed({ designSystems: { acme: '4' } })
    const check = run(dir, ['check'])
    expect(check.status).toBe(0)
    expect(check.stderr).toBe('warning: design system "acme": not recorded as installed on the canvas, expected 4: install it on the canvas, then refresh.\n')
    write(dir, 'canvas/boards/A.dc.html', board('edited'))
    write(dir, 'canvas/artifact.json', JSON.stringify({ artifact: 'https://claude.ai/artifact/x', files: 4, designSystems: { acme: '3' } }))
    const failing = run(dir, ['check'])
    expect(failing.status).toBe(1)
    expect(failing.stderr).toMatch(/edited by hand[\s\S]*\nwarning: design system "acme": installed 3, expected 4: install it again on the canvas, then refresh\.\n$/)
  })
})

describe('pages.json and tags', () => {
  it('fail the check for a board on an unlisted page or without its prefix, and warn about tags of the wrong shape', () => {
    const { dir, from } = fixture()
    run(dir, ['snapshot', '--from', from, '--version', 'v1'])
    write(dir, 'canvas/pages.json', JSON.stringify({ main: { flow: 'Everything', prefixes: ['A', 'B'] } }))
    write(dir, 'canvas/boards/A.map.json', JSON.stringify({ story: 'L/A', tags: 'one' }))
    const check = run(dir, ['check'])
    expect(check.status).toBe(1)
    expect(check.stderr).toContain('C.dc.html is on the page "main" but starts with none of its prefixes (A, B)')
    expect(check.stderr).toContain('warning: A.dc.html: "tags" in boards/A.map.json is not a list of non-empty strings')
    write(dir, 'canvas/pages.json', JSON.stringify({ main: { flow: 'Everything' } }))
    const tagsOnly = run(dir, ['check'])
    expect(tagsOnly.status).toBe(0)
    expect(tagsOnly.stderr).toContain('warning: A.dc.html: "tags"')
    write(dir, 'canvas/pages.json', JSON.stringify({ other: { flow: 'Else' } }))
    expect(run(dir, ['check']).stderr).toContain('B.dc.html is on the page "main", which pages.json does not list')
    write(dir, 'canvas/pages.json', JSON.stringify({ main: { prefixes: ['A'] } }))
    expect(run(dir, ['check']).stderr).toContain('pages.json: the page "main" has no "flow"')
  })
})

describe('several canvases', () => {
  /** The fixture with a reference canvas (one board, Arch) and a prototypes canvas, and a read of the reference canvas. */
  const canvases = () => {
    const { dir, from } = fixture()
    const ref = mkdtempSync(join(tmpdir(), 'drawing-board-reference-'))
    write(dir, 'drawing-board.config.json', JSON.stringify({ canvases: [{ id: 'main', role: 'main', artifact: 'https://claude.ai/artifact/x', snapshot: 'canvas' }, { id: 'reference', role: 'reference', artifact: 'https://claude.ai/artifact/r', snapshot: 'reference' }, { id: 'protos', role: 'prototypes', artifact: 'https://claude.ai/artifact/p' }] }))
    write(dir, 'reference/boards/ArchQueue.map.json', '{"none":"architecture","tags":["merge queue"]}')
    write(ref, 'project/canvas.json', JSON.stringify({ boards: { 'ArchQueue.dc.html': { w: 1, h: 1, page: 'arch' } } }))
    write(ref, 'project/tokens.json', '{}')
    write(ref, 'artifact-type/dc-runtime.js', '// runtime')
    run(dir, ['snapshot', '--from', from, '--version', 'v1'])
    run(dir, ['snapshot', '--from', ref, '--version', 'r1', '--canvas', 'reference'])
    return { dir, from, ref }
  }

  it('refresh, index and check the canvas --canvas names, and check every snapshot by default', () => {
    const { dir } = canvases()
    expect(JSON.parse(readFileSync(join(dir, 'reference/artifact.json'), 'utf8'))).toMatchObject({ canvas: 'reference', artifact: 'https://claude.ai/artifact/r', version: 'r1', boards: ['ArchQueue.dc.html'] })
    expect(readdirSync(join(dir, 'reference/boards')).sort()).toEqual(['ArchQueue.map.json', 'ArchQueue.meta.json', 'support.js'])
    expect(run(dir, ['index', '--canvas', 'reference']).status).toBe(0)
    const all = run(dir, ['check'])
    expect(all.stderr).toBe('')
    expect(all.stdout).toBe('The design canvas snapshot is in step.\n[main] Canvas files: 6 of 512 in use, 506 free (canvas version v1).\n[reference] Canvas files: 3 of 512 in use, 509 free (canvas version r1).\n')
    expect(run(dir, ['check', '--canvas', 'reference']).stdout).toBe('The design canvas snapshot is in step.\nCanvas files: 3 of 512 in use, 509 free (canvas version r1).\n')
  })

  it('refuse a canvas that is not there, naming the ones that are, and one with no snapshot', () => {
    const { dir } = canvases()
    expect(run(dir, ['check', '--canvas', 'nope']).stderr).toContain('There is no canvas "nope": the canvases are main, reference, protos.')
    expect(run(dir, ['report', '--canvas', 'protos']).stderr).toContain('The canvas "protos" (prototypes) has no snapshot')
  })

  it('prefix each problem with its canvas, and refuse a board name in two snapshots, naming both', () => {
    const { dir } = canvases()
    write(dir, 'reference/boards/A.meta.json', readFileSync(join(dir, 'canvas/boards/C.meta.json'), 'utf8').replace('C.dc.html', 'A.dc.html'))
    const check = run(dir, ['check'])
    expect(check.status).toBe(1)
    expect(check.stderr).toContain('- [reference] A.dc.html is on the canvas but has no map entry')
    expect(check.stderr).toContain('- A.dc.html has a meta file in the snapshots of the canvases main and reference')
  })

  it('find boards on every canvas, or the one named, best first', () => {
    const { dir } = canvases()
    expect(run(dir, ['find', 'arch', 'queue']).stdout).toBe('reference  arch  ArchQueue.dc.html  no story\n')
    expect(run(dir, ['find', 'a', 'arch']).stdout).toBe('reference  arch  ArchQueue.dc.html  no story\nmain  main  A.dc.html  L/A\nmain  main  B.dc.html  L/B\nmain  main  C.dc.html  no story\n')
    expect(run(dir, ['find', 'arch', '--canvas', 'main']).stdout).toBe('No board matches "arch".\n')
    expect(run(dir, ['find']).stderr).toMatch(/Usage: drawing-board find/)
  })
})

describe('drawing-board status', () => {
  const tree = (dir: string): Record<string, string> => Object.fromEntries((readdirSync(dir, { recursive: true, withFileTypes: true }) as Dirent[]).filter(e => e.isFile()).map(e => [join(e.parentPath, e.name), readFileSync(join(e.parentPath, e.name), 'utf8')]))

  it('says what a refresh would change, and writes nothing', () => {
    const { dir, from } = fixture()
    run(dir, ['snapshot', '--from', from, '--version', 'v1'])
    write(from, 'project/canvas.json', JSON.stringify({ pages: [{ id: 'main' }, { id: 'p', name: 'NOK-9' }], boards: { 'A.dc.html': { w: 1, h: 1, page: 'other' }, 'B.dc.html': { w: 1, h: 1, page: 'main' }, 'D.dc.html': { w: 1, h: 1, page: 'main' }, 'Proto.dc.html': { w: 1, h: 1, page: 'p' } } }))
    write(from, 'project/B.dc.html', board('new'))
    const before = tree(dir)
    const status = run(dir, ['status', '--from', from])
    expect(status.status).toBe(0)
    expect(status.stdout).toBe(
      [
        `The canvas "main" read in ${from}, against its snapshot:`,
        '- On the canvas with no meta file: D.dc.html. A full refresh adds them, or name them with --boards.',
        '- In the snapshot but no longer on the canvas: C.dc.html. A full refresh removes them.',
        '- A.dc.html is on the page other on the canvas, main in the snapshot.',
        "- Changed on the canvas since the snapshot's copy: B.dc.html.",
        'Canvas files: 6 of 512 in use, 506 free.',
        '',
      ].join('\n'),
    )
    expect(tree(dir)).toEqual(before)
  })

  it('refuses a folder with no canvas.json, naming the path, and needs --from', () => {
    const { dir } = fixture()
    const empty = mkdtempSync(join(tmpdir(), 'drawing-board-empty-'))
    const status = run(dir, ['status', '--from', empty])
    expect(status.status).toBe(1)
    expect(status.stderr).toContain(`${join(empty, 'project', 'canvas.json')} was not found`)
    expect(run(dir, ['status']).stderr).toMatch(/Usage: drawing-board status --from/)
  })
})
