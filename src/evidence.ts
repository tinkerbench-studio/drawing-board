// The UI evidence check: a change that touches what a person sees carries its before/after pictures, uploaded to the
// ticket tracker and never committed. `drawing-board evidence-check <key> [<pr-number>]` runs it on the branch.
import { execFileSync } from 'node:child_process'

import type { Config } from './config.ts'

/** The picture file types an upload takes, and so the ones that must not be committed. */
export const IMAGE = /\.(png|jpe?g|gif|webp)$/i

/** The paths a person sees, when the project names none: a stylesheet, a tokens file, Storybook's config or a design folder. */
export const DEFAULT_UI_PATHS = ['\\.(css|scss)(\\.ts)?$', '(^|/)tokens\\.json$', '^\\.storybook/', '^design/'] as const

/** Where committed pictures are refused, when the project names none. */
export const DEFAULT_PICTURE_FOLDERS = ['docs/change-screenshots/'] as const

/** What the check reads from the project: the path tests (regular expression sources) and the folders pictures may not be committed in. */
export type EvidenceRules = { uiPaths: readonly string[]; pictureFolders: readonly string[] }

export const evidenceRules = (config: Pick<Config, 'uiPaths' | 'pictureFolders'>): EvidenceRules => ({ uiPaths: config.uiPaths, pictureFolders: config.pictureFolders })

/** A path a person sees: it matches one of the rules' patterns, and is not under docs/. */
export const isUiPath = (path: string, rules: EvidenceRules): boolean => !path.startsWith('docs/') && rules.uiPaths.some(source => new RegExp(source).test(path))

export const touchesUi = (paths: readonly string[], rules: EvidenceRules): boolean => paths.some(path => isUiPath(path, rules))

/**
 * The problems with a change's evidence, each naming the item; none when it passes. `changed` is every path the change
 * touches, `added` the files the branch adds or moves in. Pictures are uploaded, never committed.
 */
export const checkEvidence = ({ changed, added = [] }: { changed: readonly string[]; added?: readonly string[] }, rules: EvidenceRules): string[] => {
  if (!touchesUi(changed, rules)) return []
  return added.filter(file => rules.pictureFolders.some(folder => file.startsWith(folder)) && IMAGE.test(file)).map(file => `${file} is committed: upload pictures instead (drawing-board upload plan, then the tracker's presign and confirm calls)`)
}

/** The ticket key a change is for: three letters, a dash and a number (`NOK-702`). */
export const isTicketKey = (text: string | undefined): text is string => /^[A-Za-z]{3,}-[1-9]\d*$/.test(text ?? '')

const git = (...args: string[]): string[] =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\n')
    .filter(Boolean)

/** Runs the check on the current branch against `base` (default origin/main); returns the exit code. */
export const evidenceCheck = (config: Config, argv: readonly string[], log: Pick<Console, 'log' | 'error'> = console): number => {
  const flagAt = argv.indexOf('--base')
  const base = flagAt === -1 ? 'origin/main' : (argv[flagAt + 1] ?? '')
  const [key, pr] = argv.filter((arg, at) => !arg.startsWith('--') && argv[at - 1] !== '--base')
  if (!isTicketKey(key) || (pr !== undefined && !/^[1-9]\d*$/.test(pr)) || base === '') {
    log.error('Usage: drawing-board evidence-check <ticket-key> [<pr-number>] [--base <ref>]')
    return 2
  }
  const rules = evidenceRules(config)
  const mergeBase = git('merge-base', 'HEAD', base)[0] ?? base
  const changed = git('diff', '--name-only', mergeBase)
  const problems = checkEvidence({ changed, added: git('diff', '--name-only', '--diff-filter=AMR', mergeBase) }, rules)
  if (problems.length === 0) {
    log.log(touchesUi(changed, rules) ? `${key}: UI evidence is complete` : `${key}: no UI path changed, nothing to check`)
    return 0
  }
  log.error(`${key}: UI evidence is incomplete:`)
  for (const problem of problems) log.error(`- ${problem}`)
  return 1
}
