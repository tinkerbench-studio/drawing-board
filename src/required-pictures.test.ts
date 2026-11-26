import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { parseConfig } from './config.ts'
import { requiredPictures, resolveImport, variants } from './required-pictures.ts'

const cli = fileURLToPath(new URL('./cli.ts', import.meta.url))
const write = (dir: string, path: string, text: string) => {
  mkdirSync(join(dir, path, '..'), { recursive: true })
  writeFileSync(join(dir, path), text)
}
const run = (cwd: string, args: string[], input = '') => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', input })

/** A project: Button (shared) used by the Card story, a Plain story that imports nothing, and a Home page reaching Button through pages/. */
const project = (config = '{"themes":["dark","light"]}') => {
  const dir = mkdtempSync(join(tmpdir(), 'drawing-board-required-'))
  write(dir, '.drawing-board', config)
  write(dir, 'src/Button.tsx', 'export const Button = 1')
  write(dir, 'src/Card.tsx', "import { Button } from './Button'\nexport const Card = Button")
  write(dir, 'src/Card.stories.tsx', "import { Card } from './Card'\nexport default { title: 'UI/Card' }")
  write(dir, 'src/Plain.stories.tsx', "export default { title: 'UI/Plain' }")
  write(dir, '.storybook/preview.ts', 'export default {}')
  write(dir, 'src/Home.tsx', "import { Card } from './Card'\nexport const Home = Card")
  return dir
}
const pages = { home: ['src/Home.tsx'] }
const names = (dir: string, changed: string[], withPages?: typeof pages, config?: string) => requiredPictures(parseConfig(config ?? '{"themes":["dark","light"]}', dir), changed, withPages)

describe('requiredPictures', () => {
  const cases: { name: string; changed: string[]; pages?: typeof pages; config?: string; touched: [string, string, string][]; required: string[] }[] = [
    { name: 'a shared component', changed: ['src/Button.tsx'], pages, touched: [['story', 'ui-card', 'src/Button.tsx'], ['page', 'home', 'src/Button.tsx']], required: ['story-ui-card-dark', 'story-ui-card-light', 'story-ui-card-phone', 'home-dark', 'home-light', 'home-phone'] },
    { name: 'a story file only', changed: ['src/Plain.stories.tsx'], pages, touched: [['story', 'ui-plain', 'src/Plain.stories.tsx']], required: ['story-ui-plain-dark', 'story-ui-plain-light', 'story-ui-plain-phone'] },
    { name: 'a preview change', changed: ['.storybook/preview.ts'], touched: [['story', 'ui-card', 'src/Card.stories.tsx'], ['story', 'ui-plain', 'src/Plain.stories.tsx']], required: ['story-ui-card-default', 'story-ui-card-phone', 'story-ui-plain-default', 'story-ui-plain-phone'], config: '{}' },
    { name: 'a diff touching nothing', changed: ['README.md'], pages, touched: [], required: [] },
    { name: 'no pageSources', changed: ['src/Home.tsx'], touched: [], required: [] },
  ]
  it.each(cases)('$name', ({ changed, pages: p, touched, required, config }) => {
    const found = names(project(), changed, p, config)
    expect(found.touched.map(t => [t.kind, t.id, t.file])).toEqual(touched)
    expect(found.required.map(r => r.name)).toEqual(required)
    expect(found.required.every(r => found.touched.some(t => t.id === r.for))).toBe(true)
  })

  it('names default and phone when themes is empty', () => {
    expect(variants([])).toEqual(['default', 'phone'])
    expect(variants(['dark'])).toEqual(['dark', 'phone'])
  })

  it('resolves ./pages to pages.tsx, not the pages/ folder beside it, and to the folder index when there is no file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-board-resolve-'))
    write(dir, 'pages.tsx', '')
    write(dir, 'pages/index.tsx', '')
    write(dir, 'main.ts', '')
    write(dir, 'only/index.ts', '')
    expect(resolveImport(join(dir, 'main.ts'), './pages')).toBe(join(dir, 'pages.tsx'))
    expect(resolveImport(join(dir, 'main.ts'), './only')).toBe(join(dir, 'only/index.ts'))
    expect(resolveImport(join(dir, 'main.ts'), './missing')).toBeUndefined()
  })

  it('reaches a changed file through a pages.tsx beside a pages/ folder', () => {
    const dir = project()
    write(dir, 'src/pages.tsx', "import { Button } from './Button'\nexport const P = Button")
    write(dir, 'src/pages/other.tsx', '')
    write(dir, 'src/App.tsx', "import { P } from './pages'")
    const found = requiredPictures(parseConfig('{}', dir), ['src/Button.tsx'], { app: ['src/App.tsx'] })
    expect(found.touched.find(t => t.kind === 'page')).toEqual({ kind: 'page', id: 'app', file: 'src/Button.tsx' })
  })
})

describe('drawing-board required-pictures', () => {
  it('reads paths from stdin and prints the contract, exit 0', () => {
    const dir = project()
    const out = run(dir, ['required-pictures'], 'src/Button.tsx\n')
    expect(out.status).toBe(0)
    expect(JSON.parse(out.stdout).touched).toEqual([{ kind: 'story', id: 'ui-card', file: 'src/Button.tsx' }])
  })

  it('reads the paths from git diff with --base', () => {
    const dir = project()
    const git = (...a: string[]) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: dir, encoding: 'utf8' })
    git('init', '-q', '-b', 'main')
    git('add', '.')
    git('commit', '-q', '-m', 'one')
    git('checkout', '-q', '-b', 'work')
    write(dir, 'src/Plain.stories.tsx', "export default { title: 'UI/Plain' } // changed")
    git('commit', '-qam', 'two')
    const out = run(dir, ['required-pictures', '--base', 'main'])
    expect(out.status).toBe(0)
    expect(JSON.parse(out.stdout).required.map((r: { name: string }) => r.name)).toEqual(['story-ui-plain-dark', 'story-ui-plain-light', 'story-ui-plain-phone'])
    const bad = run(dir, ['required-pictures', '--base', 'nope'])
    expect(bad.status).toBe(1)
    expect(bad.stdout).toBe('')
    expect(bad.stderr).toContain('git diff --name-only nope...HEAD failed')
  })

  it('exits 1 naming an unreadable file, printing nothing on stdout', () => {
    const dir = project()
    write(dir, 'src/Card.stories.tsx', "import { Card } from './Card'\nexport default { title: 'UI/Card' }")
    mkdirSync(join(dir, 'src/Broken.stories.tsx'), { recursive: true })
    const out = run(dir, ['required-pictures'], 'src/Button.tsx\n')
    expect(out.status).toBe(1)
    expect(out.stdout).toBe('')
    expect(out.stderr).toContain('src/Broken.stories.tsx could not be read')
  })

  it('exits 1 naming a pageSources() hook that throws, printing nothing on stdout', () => {
    const dir = project()
    write(dir, '.drawing-board', '{"hooks":"hooks.mjs"}')
    write(dir, 'hooks.mjs', "export const pageSources = () => { throw new Error('no pages today') }")
    const out = run(dir, ['required-pictures'], 'src/Button.tsx\n')
    expect(out.status).toBe(1)
    expect(out.stdout).toBe('')
    expect(out.stderr).toContain('The pageSources() hook threw: no pages today')
  })
})
