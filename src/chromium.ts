// Which Chromium the browser commands start. playwright-core looks only for the browser build its own version was
// made with, so a project that pins a newer playwright-core than the machine's installed browsers (a Claude Code cloud
// session ships one Playwright's browsers in /opt/pw-browsers) could not take a picture at all. The order:
//
// 1. PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, when set: that file, or a refusal naming it (never a quiet fallback).
// 2. The project's `chromium` setting (drawing-board.config.json): the first of its paths that exists.
// 3. playwright-core's own browser, when it is installed.
// 4. The known places (KNOWN_CHROMIUMS, then the newest Playwright browser build in the browser folders).
//
// None found is a refusal that lists every path tried and how to name one.
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Where a Chromium came from, as `drawing-board browser` and a refusal name it. */
export type ChromiumSource = 'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH' | 'chromium setting' | 'playwright-core' | 'known place'
/** A Chromium to start: `path` undefined means playwright-core's own browser. */
export type ChromiumChoice = { source: ChromiumSource; path?: string }

/** The environment variable that names a Chromium for every project on the machine. */
export const CHROMIUM_ENV = 'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'

/** The Claude Code cloud session's Chromium: a link to the browser build its pre-installed Playwright uses. */
export const CLOUD_CHROMIUM = '/opt/pw-browsers/chromium'

/** The fixed places looked in, in order, after the setting and playwright-core's own browser. */
export const KNOWN_CHROMIUMS = [
  CLOUD_CHROMIUM,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
] as const

/** The executable inside a Playwright `chromium-<build>` folder, per platform folder name. */
const BUILD_EXECUTABLES = ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']

/** What the search reads from the machine, so it can be tested without one. */
export type Machine = { env: Record<string, string | undefined>; home: string; exists: (path: string) => boolean; list: (dir: string) => string[] }

export const thisMachine = (): Machine => ({
  env: process.env,
  home: homedir(),
  exists: existsSync,
  list: dir => {
    try {
      return readdirSync(dir)
    } catch {
      return []
    }
  },
})

/** The folders Playwright installs browsers into: PLAYWRIGHT_BROWSERS_PATH when set, then the default caches. */
export const browserFolders = (machine: Machine): string[] => {
  const set = machine.env.PLAYWRIGHT_BROWSERS_PATH
  const folders = [set !== undefined && set !== '' && set !== '0' ? set : undefined, join(machine.home, '.cache/ms-playwright'), join(machine.home, 'Library/Caches/ms-playwright')]
  return [...new Set(folders.filter((f): f is string => f !== undefined))]
}

/** The Chromium of each Playwright `chromium-<build>` folder in the browser folders, newest build first. */
export const playwrightBuilds = (machine: Machine): string[] =>
  browserFolders(machine).flatMap(folder =>
    machine
      .list(folder)
      .map(name => /^chromium-(\d+)$/.exec(name))
      .filter((m): m is RegExpExecArray => m !== null)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .flatMap(m => BUILD_EXECUTABLES.map(exe => join(folder, m[0], exe)))
      .filter(path => machine.exists(path)),
  )

/** Every path the fallback looks in, in order: the known places, then the Playwright builds found. */
export const fallbackChromiums = (machine: Machine): string[] => [...new Set([...KNOWN_CHROMIUMS, ...playwrightBuilds(machine)])]

/** The setting's paths, made absolute from the project folder. */
const configured = (setting: readonly string[], root: string): string[] => setting.map(p => (p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) ? p : join(root, p)))

/**
 * The Chromium chosen before playwright-core's own browser is tried: the variable, else the first existing path of the
 * setting. Undefined when neither names one, so the caller tries playwright-core's own and then `fallback`. Refuses a
 * variable naming a file that is not there.
 */
export const chosenChromium = (machine: Machine, setting: readonly string[] = [], root = process.cwd()): ChromiumChoice | undefined => {
  const fromEnv = machine.env[CHROMIUM_ENV]
  if (fromEnv !== undefined && fromEnv !== '') {
    if (!machine.exists(fromEnv)) throw new Error(`${CHROMIUM_ENV} is ${fromEnv}, and there is no file there. Point it at a Chromium or Chrome executable, or unset it to use the project's "chromium" setting or a known place (see "Which Chromium" in the drawing-board README).`)
    return { source: CHROMIUM_ENV, path: fromEnv }
  }
  const found = configured(setting, root).find(p => machine.exists(p))
  return found === undefined ? undefined : { source: 'chromium setting', path: found }
}

/** The first fallback that exists, or undefined. */
export const fallbackChromium = (machine: Machine): ChromiumChoice | undefined => {
  const found = fallbackChromiums(machine).find(p => machine.exists(p))
  return found === undefined ? undefined : { source: 'known place', path: found }
}

/** The refusal when no Chromium is found: every path tried, and the three ways to name one. */
export const noChromium = (machine: Machine, setting: readonly string[], root: string, playwrightPath: string | undefined): string =>
  [
    'No Chromium found for the pictures. Looked in:',
    ...configured(setting, root).map(p => `- ${p} (the "chromium" setting)`),
    ...(playwrightPath === undefined ? [] : [`- ${playwrightPath} (playwright-core's own browser)`]),
    ...fallbackChromiums(machine).map(p => `- ${p}`),
    ...browserFolders(machine).map(f => `- ${f}/chromium-<build>/ (a Playwright browser build)`),
    `Name one with ${CHROMIUM_ENV}=<path>, or "chromium": ["<path>"] in drawing-board.config.json, or install playwright-core's own with npx playwright-core install chromium.`,
  ].join('\n')
