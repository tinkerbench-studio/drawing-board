import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { pageShotsOptions, pageVariants } from './board-shot-run.ts'
import { parseConfig } from './config.ts'
import { expandGlobs, hookModule, loadHooks } from './hooks.ts'

const write = (dir: string, path: string, text: string) => {
  mkdirSync(join(dir, path, '..'), { recursive: true })
  writeFileSync(join(dir, path), text)
}

describe('expandGlobs', () => {
  it("turns Vite's eager glob of JSON files into the object Vite gives, leaving other globs alone", () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-board-glob-'))
    write(dir, 'boards/A.meta.json', '{"file":"A.dc.html"}')
    write(dir, 'boards/B.meta.json', '{"file":"B.dc.html"}')
    const out = expandGlobs("const m = import.meta.glob<Meta>('./boards/*.meta.json', { eager: true, import: 'default' })\nconst s = import.meta.glob('./x/*.ts')", dir)
    expect(out).toContain('const m = ({"./boards/A.meta.json":{"file":"A.dc.html"},"./boards/B.meta.json":{"file":"B.dc.html"}})')
    expect(out).toContain("import.meta.glob('./x/*.ts')")
  })
})

describe('hookModule', () => {
  it('finds drawing-board.ts (or .tsx, .mjs…) in the snapshot folder, or the "hooks" setting, or none', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-board-hooks-'))
    expect(hookModule(parseConfig('', dir))).toBeUndefined()
    write(dir, 'design/canvas/drawing-board.tsx', 'export {}')
    expect(hookModule(parseConfig('', dir))).toBe(join(dir, 'design/canvas/drawing-board.tsx'))
    write(dir, 'tools/hooks.ts', 'export {}')
    expect(hookModule(parseConfig('{"hooks":"tools/hooks.ts"}', dir))).toBe(join(dir, 'tools/hooks.ts'))
    expect(() => hookModule(parseConfig('{"hooks":"tools/none.ts"}', dir))).toThrow(/does not exist/)
  })
})

describe('page-shots variants and options', () => {
  it('draws each theme and a phone in the first, or the page as it is and its phone when there are no themes', () => {
    expect(pageVariants(['dark', 'light'])).toEqual([
      { name: 'dark', theme: 'dark', phone: false },
      { name: 'light', theme: 'light', phone: false },
      { name: 'phone', theme: 'dark', phone: true },
    ])
    expect(pageVariants(['dark', 'light'], 'light')).toEqual([
      { name: 'light', theme: 'light', phone: false },
      { name: 'phone', theme: 'light', phone: true },
    ])
    expect(pageVariants([])).toEqual([
      { name: 'desktop', theme: null, phone: false },
      { name: 'phone', theme: null, phone: true },
    ])
    expect(() => pageVariants(['dark'], 'blue')).toThrow(/not one of the themes/)
  })

  it('reads --out, --theme, --only and --mark', () => {
    expect(pageShotsOptions(['--only', 'board, ticket', '--theme', 'light', '--mark', '.x', '--out', 'o'])).toEqual({ only: ['board', 'ticket'], theme: 'light', mark: '.x', out: 'o' })
  })
})

/** A project whose hook module reads the snapshot's metadata with Vite's glob and a sibling module, and adds a problem. */
const hooked = () => {
  const dir = mkdtempSync(join(tmpdir(), 'drawing-board-hooked-'))
  write(dir, '.drawing-board', '{"artifact":"https://claude.ai/artifact/x"}')
  write(dir, 'design/canvas/boards/A.meta.json', '{"file":"A.dc.html","title":null,"page":null,"w":1,"h":1}')
  write(dir, 'design/canvas/boards/A.map.json', '{"none":"a spec"}')
  write(dir, 'design/canvas/story-index.json', '{}')
  write(dir, 'design/canvas/rule.ts', "export const rule = (files: string[]) => files.map(f => `${f} breaks the house rule.`)")
  write(dir, 'design/canvas/drawing-board.ts', "import { rule } from './rule.ts'\nconst metas = import.meta.glob('./boards/*.meta.json', { eager: true, import: 'default' })\nexport const checks = () => rule(Object.values(metas).map((m: any) => m.file))\nexport const pages = () => ({ home: '<h1>Home</h1>', wide: { html: '<h1>Wide</h1>', width: 900, css: 'h1{color:red}' } })")
  return dir
}

describe('loadHooks', () => {
  it("bundles the project's module, with its relative imports and JSON globs, and returns what it exports", async () => {
    const hooks = await loadHooks(parseConfig('', hooked()))
    expect(await hooks.checks!({} as never)).toEqual(['A.dc.html breaks the house rule.'])
    expect(Object.keys(await hooks.pages!({} as never))).toEqual(['home', 'wide'])
  })

  it('adds the checks hook to drawing-board check', () => {
    const dir = hooked()
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./cli.ts', import.meta.url)), 'check'], { cwd: dir, encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('- A.dc.html breaks the house rule.')
  })
})

describe.skipIf(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH === undefined)('page-shots in Chromium', () => {
  it('shoots each page the hook returns, in each variant', { timeout: 60000 }, async () => {
    const dir = hooked()
    write(dir, '.drawing-board', '{"artifact":"https://claude.ai/artifact/x","themes":["dark","light"]}')
    const { pageShots } = await import('./board-shot-run.ts')
    const written = await pageShots(parseConfig('{"themes":["dark","light"]}', dir), {})
    expect(written.map(f => f.split(/[\\/]/).at(-1)).sort()).toEqual(['home-dark.png', 'home-light.png', 'home-phone.png', 'wide-dark.png', 'wide-light.png', 'wide-phone.png'])
  })
})
