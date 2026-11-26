import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { canvasOption, CONFIG_FILE, DEFAULT_LIMITS, DEFAULTS, findConfig, LEGACY_CONFIG_FILE, loadConfig, parseConfig, snapshotConfigs } from './config.ts'
import { TICKET_PAGE } from './snapshot.ts'

const root = resolve('/project')

describe('parseConfig', () => {
  it('gives every setting its convention when there is no file', () => {
    expect(parseConfig('', root)).toEqual({
      artifact: null,
      snapshot: resolve(root, DEFAULTS.snapshot),
      stories: DEFAULTS.stories,
      tokens: 'tokens.json',
      prototypePages: TICKET_PAGE,
      storybook: resolve(root, 'storybook-static'),
      out: resolve(root, 'reports/design-canvas'),
      differences: resolve(root, DEFAULTS.snapshot, 'differences'),
      checks: {},
      compare: {},
      themes: [],
      root,
      canvas: { id: 'main', role: 'main' },
      canvases: [{ id: 'main', role: 'main', artifact: null, snapshot: resolve(root, DEFAULTS.snapshot), prototypePages: TICKET_PAGE }],
      limits: { files: 512, headroom: 16 },
      chromium: [],
    })
  })

  it('takes "chromium" as one path or a list, and refuses anything else', () => {
    expect(parseConfig(JSON.stringify({ chromium: '/usr/bin/chromium' }), root).chromium).toEqual(['/usr/bin/chromium'])
    expect(parseConfig(JSON.stringify({ chromium: ['tools/chrome', '/opt/chrome'] }), root).chromium).toEqual(['tools/chrome', '/opt/chrome'])
    for (const bad of [3, [''], ['/a', 2], {}]) expect(() => parseConfig(JSON.stringify({ chromium: bad }), root)).toThrow(/"chromium" must be a path to a Chromium executable, or a list of them/)
  })

  it('takes only what the file names, and leaves the rest to convention', () => {
    const config = parseConfig(JSON.stringify({ snapshot: 'fixtures/design-canvas', tokens: 'ds/nookivia/tokens.json', prototypePages: '^prototypes\\b' }), root)
    expect(config.snapshot).toBe(resolve(root, 'fixtures/design-canvas'))
    expect(config.tokens).toBe('ds/nookivia/tokens.json')
    expect(config.prototypePages.test('Prototypes page')).toBe(true)
    expect(config.storybook).toBe(resolve(root, 'storybook-static'))
    expect(config.stories).toEqual(DEFAULTS.stories)
  })

  it('keeps the differences lists in the snapshot unless told where else, and follows a moved snapshot', () => {
    expect(parseConfig(JSON.stringify({ snapshot: 'fixtures/dc' }), root).differences).toBe(resolve(root, 'fixtures/dc/differences'))
    expect(parseConfig(JSON.stringify({ snapshot: 'fixtures/dc', differences: 'fixtures/diffs' }), root).differences).toBe(resolve(root, 'fixtures/diffs'))
    expect(() => parseConfig(JSON.stringify({ differences: '' }), root)).toThrow(/"differences" must be a non-empty string/)
  })

  it('reads the canvas link the last snapshot recorded when the file does not set one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-board-config-'))
    mkdirSync(join(dir, 'design/canvas'), { recursive: true })
    writeFileSync(join(dir, 'design/canvas/artifact.json'), JSON.stringify({ artifact: 'https://claude.ai/artifact/recorded' }))
    expect(parseConfig('', dir).artifact).toBe('https://claude.ai/artifact/recorded')
    expect(parseConfig(JSON.stringify({ artifact: 'https://claude.ai/artifact/set' }), dir).artifact).toBe('https://claude.ai/artifact/set')
  })

  it.each([
    ['{', /not JSON/],
    ['[]', /not a JSON object/],
    [JSON.stringify({ snapshots: 'x' }), /"snapshots" is not a setting/],
    [JSON.stringify({ artifact: '' }), /"artifact" must be/],
    [JSON.stringify({ stories: [] }), /"stories" must be a list/],
    [JSON.stringify({ prototypePages: '(' }), /not a regular expression/],
    [JSON.stringify({ checks: [] }), /"checks" must be an object/],
    [JSON.stringify({ checks: { outline: true } }), /"checks.outline" is not a check/],
    [JSON.stringify({ checks: { tokenThemes: 'yes' } }), /"checks.tokenThemes" must be true or false/],
    [JSON.stringify({ checks: { tokensCss: [] } }), /"checks.tokensCss" must be a list/],
    [JSON.stringify({ compare: [] }), /"compare" must be an object/],
    [JSON.stringify({ compare: { layout: true } }), /"compare.layout" is not a compare option/],
    [JSON.stringify({ compare: { order: 'yes' } }), /"compare.order" must be true or false/],
    [JSON.stringify({ themes: 'dark' }), /"themes" must be a list of theme names/],
  ])('refuses %s', (text, message) => {
    expect(() => parseConfig(text, root)).toThrow(message)
  })
})

describe('compare', () => {
  it('is empty by default and keeps only the options turned on', () => {
    expect(parseConfig('{}', root).compare).toEqual({})
    expect(parseConfig(JSON.stringify({ compare: { order: true, closestState: false } }), root).compare).toEqual({ order: true })
    expect(parseConfig(JSON.stringify({ compare: { order: true, closestState: true } }), root).compare).toEqual({ order: true, closestState: true })
  })
})

describe('checks', () => {
  it('are all off unless named, and a false flag is off', () => {
    expect(parseConfig('{}', root).checks).toEqual({})
    expect(parseConfig(JSON.stringify({ checks: { repeatedSampleKeys: false } }), root).checks).toEqual({})
  })
  it('turns on the flags named and keeps the stylesheet globs', () => {
    const checks = { repeatedSampleKeys: true, outlineSelectors: true, passedSamples: true, tokenThemes: true, tokensCss: ['src/**/*.css'] }
    expect(parseConfig(JSON.stringify({ checks }), root).checks).toEqual(checks)
  })
  it('names the file it read in a refusal', () => {
    expect(() => parseConfig('{"x":1}', root, LEGACY_CONFIG_FILE)).toThrow(/^\.drawing-board: "x" is not a setting/)
  })
})

describe('findConfig', () => {
  it(`finds the nearest ${CONFIG_FILE} at or above a folder, or none`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-board-find-'))
    mkdirSync(join(dir, 'a/b'), { recursive: true })
    expect(findConfig(join(dir, 'a/b'))).toBeUndefined()
    writeFileSync(join(dir, CONFIG_FILE), '{}')
    expect(findConfig(join(dir, 'a/b'))).toBe(join(dir, CONFIG_FILE))
  })

  it('reads the legacy name when it is the only one, and prefers the new name when both are there', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-board-names-'))
    writeFileSync(join(dir, LEGACY_CONFIG_FILE), '{"snapshot":"old"}')
    expect(findConfig(dir)).toBe(join(dir, LEGACY_CONFIG_FILE))
    writeFileSync(join(dir, CONFIG_FILE), '{"snapshot":"new"}')
    expect(findConfig(dir)).toBe(join(dir, CONFIG_FILE))
  })
  it('prefers a nearer legacy file to a farther preferred one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-board-near-'))
    mkdirSync(join(dir, 'a'))
    writeFileSync(join(dir, CONFIG_FILE), '{}')
    writeFileSync(join(dir, 'a', LEGACY_CONFIG_FILE), '{}')
    expect(findConfig(join(dir, 'a'))).toBe(join(dir, 'a', LEGACY_CONFIG_FILE))
  })
  it('loadConfig reads either name from --config and reports the legacy name in its errors', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-board-load-'))
    writeFileSync(join(dir, LEGACY_CONFIG_FILE), '{"snapshot":"old"}')
    expect(loadConfig(join(dir, LEGACY_CONFIG_FILE)).snapshot).toBe(join(dir, 'old'))
    writeFileSync(join(dir, CONFIG_FILE), '{"snapshot":"new"}')
    expect(loadConfig(join(dir, CONFIG_FILE)).snapshot).toBe(join(dir, 'new'))
    writeFileSync(join(dir, LEGACY_CONFIG_FILE), '{"bad":1}')
    expect(() => loadConfig(join(dir, LEGACY_CONFIG_FILE))).toThrow(/^\.drawing-board: "bad"/)
  })
})

describe('canvases', () => {
  const link = (id: string) => `https://claude.ai/artifact/${id}`
  const three = {
    prototypePages: '^proto',
    canvases: [
      { id: 'main', role: 'main', artifact: link('m') },
      { id: 'protos', role: 'prototypes', artifact: link('p') },
      { id: 'reference', role: 'reference', artifact: link('r'), snapshot: 'design/reference', prototypePages: '^draft' },
    ],
  }

  it('is one main canvas built from the top-level fields when the file has none', () => {
    const config = parseConfig(JSON.stringify({ artifact: link('m'), snapshot: 'dc' }), root)
    expect(config.canvas).toEqual({ id: 'main', role: 'main' })
    expect(config.canvases).toEqual([{ id: 'main', role: 'main', artifact: link('m'), snapshot: resolve(root, 'dc'), prototypePages: TICKET_PAGE }])
    expect(config.limits).toEqual(DEFAULT_LIMITS)
    expect(config.designSystems).toBeUndefined()
  })

  it('takes the main canvas by default, its snapshot by convention, and every canvas resolved', () => {
    const config = parseConfig(JSON.stringify(three), root)
    expect(config.canvas).toEqual({ id: 'main', role: 'main' })
    expect(config.artifact).toBe(link('m'))
    expect(config.snapshot).toBe(resolve(root, DEFAULTS.snapshot))
    expect(config.prototypePages.test('proto one')).toBe(true)
    expect(config.canvases.map(c => [c.id, c.snapshot])).toEqual([
      ['main', resolve(root, DEFAULTS.snapshot)],
      ['protos', undefined],
      ['reference', resolve(root, 'design/reference')],
    ])
  })

  it('picks a canvas by id, with its own link, snapshot, prototype pages and differences folder', () => {
    const config = parseConfig(JSON.stringify(three), root, CONFIG_FILE, 'reference')
    expect(config.canvas).toEqual({ id: 'reference', role: 'reference' })
    expect(config.artifact).toBe(link('r'))
    expect(config.snapshot).toBe(resolve(root, 'design/reference'))
    expect(config.differences).toBe(resolve(root, 'design/reference/differences'))
    expect(config.prototypePages.test('draft page')).toBe(true)
    expect(config.prototypePages.test('proto page')).toBe(false)
    expect(parseConfig(JSON.stringify({ ...three, differences: 'diffs' }), root, CONFIG_FILE, 'reference').differences).toBe(resolve(root, 'diffs'))
  })

  it('refuses an unknown canvas, naming the ones there are, and a canvas with no snapshot', () => {
    expect(() => parseConfig(JSON.stringify(three), root, CONFIG_FILE, 'nope')).toThrow('There is no canvas "nope": the canvases are main, protos, reference.')
    expect(() => parseConfig('', root, CONFIG_FILE, 'reference')).toThrow(/the canvases are main\./)
    expect(() => parseConfig(JSON.stringify(three), root, CONFIG_FILE, 'protos')).toThrow(/"protos" \(prototypes\) has no snapshot/)
    const bare = { canvases: [three.canvases[0], { id: 'ref', role: 'reference', artifact: link('r') }] }
    expect(() => parseConfig(JSON.stringify(bare), root, CONFIG_FILE, 'ref')).toThrow(/"ref" \(reference\) has no snapshot: set its "snapshot"/)
  })

  it('gives a config for each canvas with a snapshot, main first', () => {
    const configs = snapshotConfigs(parseConfig(JSON.stringify({ canvases: [three.canvases[2], three.canvases[1], three.canvases[0]] }), root))
    expect(configs.map(c => [c.canvas.id, c.snapshot])).toEqual([
      ['main', resolve(root, DEFAULTS.snapshot)],
      ['reference', resolve(root, 'design/reference')],
    ])
    expect(snapshotConfigs(parseConfig('', root)).map(c => c.canvas.id)).toEqual(['main'])
  })

  it('loadConfig picks the canvas named, and reads each snapshot\'s recorded link when one is not set', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-board-canvases-'))
    mkdirSync(join(dir, 'ref'), { recursive: true })
    writeFileSync(join(dir, 'ref/artifact.json'), JSON.stringify({ canvas: 'reference', artifact: link('recorded'), version: 'v3' }))
    writeFileSync(join(dir, CONFIG_FILE), JSON.stringify({ canvases: [{ id: 'main', role: 'main', artifact: link('m') }, { id: 'reference', role: 'reference', artifact: link('r'), snapshot: 'ref' }] }))
    expect(loadConfig(join(dir, CONFIG_FILE), 'reference').snapshot).toBe(join(dir, 'ref'))
    expect(loadConfig(join(dir, CONFIG_FILE)).canvas.id).toBe('main')
    writeFileSync(join(dir, CONFIG_FILE), JSON.stringify({ snapshot: 'ref' }))
    expect(loadConfig(join(dir, CONFIG_FILE)).artifact).toBe(link('recorded'))
  })

  const main = { id: 'main', role: 'main', artifact: link('m') }
  it.each([
    [{ canvases: [main], artifact: link('m') }, /"artifact" goes on each canvas in "canvases"/],
    [{ canvases: [main], snapshot: 'x' }, /"snapshot" goes on each canvas in "canvases"/],
    [{ canvases: [] }, /"canvases" must be a list of canvases/],
    [{ canvases: {} }, /"canvases" must be a list of canvases/],
    [{ canvases: ['main'] }, /canvases\[0\] is not an object/],
    [{ canvases: [{ ...main, id: 'Main' }] }, /canvases\[0\]: "id" must be a lowercase name/],
    [{ canvases: [{ ...main, id: '1st' }] }, /"id" must be a lowercase name/],
    [{ canvases: [main, { ...main, role: 'reference' }] }, /the canvas id "main" is used twice/],
    [{ canvases: [{ ...main, role: 'archive' }] }, /"role" must be one of main, prototypes, reference/],
    [{ canvases: [{ ...main, role: 'reference' }] }, /exactly one canvas with the role main \(it has 0\)/],
    [{ canvases: [main, { ...main, id: 'two' }] }, /exactly one canvas with the role main \(it has 2\)/],
    [{ canvases: [main, { id: 'p1', role: 'prototypes', artifact: link('1') }, { id: 'p2', role: 'prototypes', artifact: link('2') }] }, /at most one canvas with the role prototypes \(it has 2\)/],
    [{ canvases: [main, { id: 'p', role: 'prototypes', artifact: link('p'), snapshot: 'p' }] }, /a prototypes canvas has no snapshot.*remove "snapshot"/],
    [{ canvases: [{ ...main, artifact: undefined }] }, /\("main"\): "artifact" must be a non-empty string/],
    [{ canvases: [{ ...main, snapshot: '' }] }, /\("main"\): "snapshot" must be a non-empty string/],
    [{ canvases: [{ ...main, prototypePages: '(' }] }, /the canvas "main": "prototypePages" is not a regular expression/],
    [{ canvases: [{ ...main, stories: ['x'] }] }, /"stories" is not a canvas setting/],
  ])('refuses %j', (settings, message) => {
    expect(() => parseConfig(JSON.stringify(settings), root)).toThrow(message)
  })
})

describe('designSystems and limits', () => {
  it('are none and 512 files with 16 to spare unless set', () => {
    const config = parseConfig('', root)
    expect(config.designSystems).toBeUndefined()
    expect(config.limits).toEqual({ files: 512, headroom: 16 })
  })
  it('take what the file sets, keeping the other limit', () => {
    const config = parseConfig(JSON.stringify({ designSystems: { zeta: '2', acme: '3' }, limits: { headroom: 40 } }), root)
    expect(config.designSystems).toEqual({ acme: '3', zeta: '2' })
    expect(config.limits).toEqual({ files: 512, headroom: 40 })
  })
  it.each([
    [{ designSystems: [] }, /"designSystems" must be an object of design system namespace to version/],
    [{ designSystems: { acme: 3 } }, /"designSystems" must be an object/],
    [{ limits: 512 }, /"limits" must be an object/],
    [{ limits: { file: 1 } }, /"limits.file" is not a limit/],
    [{ limits: { files: 0 } }, /"limits.files" must be a whole number above 0/],
    [{ limits: { headroom: -1 } }, /"limits.headroom" must be a whole number, 0 or more/],
    [{ limits: { headroom: 1.5 } }, /"limits.headroom" must be a whole number/],
  ])('refuse %j', (settings, message) => {
    expect(() => parseConfig(JSON.stringify(settings), root)).toThrow(message)
  })
})

describe('canvasOption', () => {
  it('is the id after --canvas, or none', () => {
    expect(canvasOption(['check', '--canvas', 'reference'])).toBe('reference')
    expect(canvasOption(['check'])).toBeUndefined()
  })
  it.each([[['--canvas']], [['--canvas', '--config', 'x']], [['--canvas=reference']]])('refuses %j rather than fall back to the main canvas', argv => {
    expect(() => canvasOption(argv)).toThrow(/--canvas/)
  })
})
