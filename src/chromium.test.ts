import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { CHROMIUM_ENV, chosenChromium, CLOUD_CHROMIUM, fallbackChromium, fallbackChromiums, KNOWN_CHROMIUMS, noChromium, type Machine } from './chromium.ts'

/** A machine with these files and folders, and these environment variables. */
const machine = (files: string[], env: Record<string, string> = {}, folders: Record<string, string[]> = {}): Machine => ({
  env,
  home: '/home/me',
  exists: path => files.includes(path),
  list: dir => folders[dir] ?? [],
})

describe('chosenChromium', () => {
  it('takes the variable first, over the setting', () => {
    const m = machine(['/env/chrome', '/set/chrome'], { [CHROMIUM_ENV]: '/env/chrome' })
    expect(chosenChromium(m, ['/set/chrome'])).toEqual({ source: CHROMIUM_ENV, path: '/env/chrome' })
  })

  it('refuses a variable naming no file, rather than quietly using another browser', () => {
    const m = machine([CLOUD_CHROMIUM], { [CHROMIUM_ENV]: '/gone/chrome' })
    expect(() => chosenChromium(m)).toThrow(`${CHROMIUM_ENV} is /gone/chrome, and there is no file there`)
  })

  it('takes the first path of the setting that exists, relative ones from the project folder', () => {
    const m = machine(['/project/tools/chrome', '/opt/chrome'])
    expect(chosenChromium(m, ['/missing/chrome', 'tools/chrome', '/opt/chrome'], '/project')).toEqual({ source: 'chromium setting', path: '/project/tools/chrome' })
  })

  it('chooses nothing when neither names an existing file, so playwright-core is tried next', () => {
    expect(chosenChromium(machine([CLOUD_CHROMIUM]), ['/missing/chrome'])).toBeUndefined()
    expect(chosenChromium(machine([], { [CHROMIUM_ENV]: '' }))).toBeUndefined()
  })
})

describe('fallbackChromium', () => {
  it("finds the Claude Code cloud session's Chromium first", () => {
    expect(fallbackChromium(machine([CLOUD_CHROMIUM, '/usr/bin/chromium']))).toEqual({ source: 'known place', path: CLOUD_CHROMIUM })
  })

  it('looks in the known places in order', () => {
    expect(fallbackChromium(machine(['/usr/bin/google-chrome', '/usr/bin/chromium']))?.path).toBe('/usr/bin/chromium')
  })

  it('finds the newest Playwright build in PLAYWRIGHT_BROWSERS_PATH and the default cache, after the known places', () => {
    const builds = { '/pw': ['chromium-1100', 'chromium-1243', 'ffmpeg-1011', 'chromium_headless_shell-1243'], '/home/me/.cache/ms-playwright': ['chromium-1200'] }
    const files = ['/pw/chromium-1100/chrome-linux64/chrome', '/pw/chromium-1243/chrome-linux64/chrome', '/home/me/.cache/ms-playwright/chromium-1200/chrome-linux/chrome']
    const m = machine(files, { PLAYWRIGHT_BROWSERS_PATH: '/pw' }, builds)
    expect(fallbackChromiums(m).slice(KNOWN_CHROMIUMS.length)).toEqual(files.slice(0, 2).reverse().concat(files[2]!))
    expect(fallbackChromium(m)?.path).toBe('/pw/chromium-1243/chrome-linux64/chrome')
  })

  it('finds none on a machine with no browser', () => {
    expect(fallbackChromium(machine([]))).toBeUndefined()
  })
})

describe('noChromium', () => {
  it('lists every place looked in and the ways to name a browser', () => {
    const message = noChromium(machine([]), ['tools/chrome'], '/project', '/pw/chromium-1248/chrome-linux64/chrome')
    expect(message).toContain(`- ${join('/project', 'tools/chrome')} (the "chromium" setting)`)
    expect(message).toContain("- /pw/chromium-1248/chrome-linux64/chrome (playwright-core's own browser)")
    expect(message).toContain(`- ${CLOUD_CHROMIUM}`)
    expect(message).toContain('- /home/me/.cache/ms-playwright/chromium-<build>/')
    expect(message).toContain(`${CHROMIUM_ENV}=<path>`)
    expect(message).toContain('"chromium": ["<path>"] in drawing-board.config.json')
  })
})
