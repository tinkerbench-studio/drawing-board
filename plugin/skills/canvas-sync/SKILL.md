---
name: canvas-sync
description: Keeping a project's design canvas (a private claude.ai Design artifact), its committed snapshot and Storybook in step — who owns what, publishing to the canvas and refreshing the snapshot in the same change, refreshing only the boards you changed, resolving a snapshot conflict, and what to do when a board and its story disagree. Use whenever a change touches a page, component, story, stylesheet or token a canvas board draws, whenever the canvas changes, whenever the project's canvas check fails, and when a snapshot file conflicts on a merge.
---

# Keeping the canvas, the snapshot and Storybook in step

Read `.claude/drawing-board.md` first: it names this project's canvas, snapshot folder, commands
and pages. If the project has none, copy `${CLAUDE_PLUGIN_ROOT}/templates/drawing-board.md` (in the
repository, `plugin/templates/drawing-board.md` of tinkerbench-studio/drawing-board), fill in what
you can find, and ask the owner for the rest before you publish anything.

The canvas is private, so CI cannot read it. The repository keeps a **committed snapshot** of it,
and the checks compare that snapshot with what the build ships. A change on the canvas that is not
snapshotted and committed is invisible to every check.

## Who owns what

| What | Owner |
| --- | --- |
| How a screen looks, its structure and fixed wording | The canvas board |
| Design tokens (colour, type, spacing, radii, shadows) | The canvas; the snapshot holds a copy and the CSS is checked against it |
| Sample text a board and its story both show | The canvas (`data-sample` marks, lifted into the snapshot); the story reads them with `canvasSample`, never retypes them |
| What a component draws, its states and variants | The code and Storybook |
| What the app really has (a figure, a list, a count) | The app. A board ahead of the app is recorded, never faked in a fixture |

Anything already built and merged is the code's; a design not yet built is the canvas's. Ask the
owner only when you cannot tell.

The canvas stays the source of truth after a design is built: its board is kept, refreshed and
checked, not retired once the code exists. **Delete a board only when its design is deprecated**
(the screen or state is gone from the product), never to make room.

A project may have several canvases (`.claude/drawing-board.md`, "Canvases"): `main` for the built
designs, `prototypes` for designs under way, `reference` for boards that are not app screens. Each
command takes `--canvas <id>` for one other than main.

## Every publish ends with a refresh

Design work is any publish to the canvas: a new or changed board, a token, a sample mark, a fix to
a board someone else broke. **The same change refreshes the snapshot and commits it.** A publish
with no refresh after it is unfinished work, whatever the ticket.

- **See what changed first.** Read the canvas into a folder and run `drawing-board status --from
  <folder>` (it writes nothing). It lists boards added, removed or moved, copies changed on the
  canvas, the design systems installed, and the files the canvas holds.
- **Check the free files before you publish.** A canvas holds at most 512 files of its own, and a
  publish over that is refused (422). `status --from` gives the current count; `check` gives the count
  the last refresh recorded. Fewer free than your change adds: stop, set the ticket to need a person,
  say how many files are free and how many the change needs, and do not publish. Do not delete
  boards to make room.
- **Read before you publish.** Read each board you will change from the canvas, not from your
  checkout, in the same session. Publish only the boards you changed. Never republish a board you
  did not change: a whole-file send from an older copy silently undoes someone else's design.
  Send the canvas's page index (`project/canvas.json`) only when a board is added, removed or moved.
- **Ask before publishing a main board** unless the owner asked for that edit. A board on your
  ticket's prototype page needs no asking (`design-change`).
- **Read back after you publish**, into the folder you refresh from, so the snapshot is what the
  canvas now holds, not your local copy. Note the version the read reports.
- **Refresh only the boards you changed** (the project's partial refresh, with `--tokens` when the
  tokens changed). A read of the canvas holds every board at its latest version, including boards
  other open pull requests published but have not merged; a partial refresh leaves every other
  board's files byte for byte as committed, so two pull requests never carry each other's design
  changes. Use a full refresh only to catch up with the whole canvas or to resolve a conflict. If
  the project has no partial refresh yet, say so in the pull request and expect conflicts. A
  partial refresh names the boards on the canvas it did not add; leave them to a full refresh.
- **A refresh writes the record**, `artifact.json`: the canvas, the version read, the last full
  refresh's version, the files in use, the boards and the design systems installed. Commit it with
  the rest; never edit it by hand.
- **Refresh first, then design.** If the snapshot is older than the canvas before you start on a
  board, refresh it first, so differences you did not make are seen now, not found later.
- **A failing check after a refresh is the work.** Decide from the table above whether the code or
  the board is wrong, fix that one, and refresh again. Never hold back boards from a refresh to get
  green, and never leave the canvas ahead of the snapshot "for the ticket that builds it".
- **Never hand-edit a generated snapshot file** (board copies, per-board metadata, hashes,
  outlines, samples). Publish the board and refresh. Map files that say which story shows a board
  are hand-kept; everything else is generated.
- **Never pin the canvas version in a test.** It moves on every publish.
- **A board's version moves only with its copy.** A refresh of an unchanged board changes nothing,
  so refresh with `--boards` and no file holds a version that moves on every refresh.

## Setup and commands

The snapshot commands are the `@tinkerbench-studio/drawing-board` package, fetched from GitHub
Packages. Running it needs `NODE_AUTH_TOKEN` set to a token with `read:packages` and nothing else,
not a full-scope token such as `gh auth token`, since `npx --yes` runs the package with whatever
token the environment holds. `.claude/drawing-board.md` says how the project installs it and what
else it adds to the commands.

| Step | Command | Notes |
| --- | --- | --- |
| Refresh the boards you changed | `drawing-board snapshot --from <folder> --version <version> --boards A.dc.html,B.dc.html` | `--tokens` when the tokens changed; `--canvas <id>` for a canvas other than main |
| Full refresh | `drawing-board snapshot --from <folder> --version <version>` | Only to catch up or resolve a conflict |
| Check | `drawing-board check` | Every snapshot's checks, the files in use, then warnings |
| Rebuild the story index | `drawing-board index` | After editing or merging a map file's `story` |
| Boards with no story, stories with no board | `drawing-board report` | |
| Find a board | `drawing-board find <words…>` | By name, page, flow, keywords, story and tags |

## A change starting in the code

1. **Does a board draw it?** Look the story up in the project's map files or story index. No board
   means nothing to keep in step; a new screen or component is designed on the canvas first
   (`design-change`), not invented in code.
2. **Does the change alter what the board draws?** Wording, a heading, a control, a label, a
   column, their order, a colour, a state, a figure. If not, stop.
3. **Say which side is right** and act on the table below.
4. **Compare** the board with its story with `drawing-board compare` (or the command `.claude/drawing-board.md` names), and put any difference
   you leave in the pull request with which side is right and why.
5. A build that adds a story maps its board in the same pull request, and rebuilds the story index
   if the project has one.

## When a board and its story disagree

| Case | Do | Never |
| --- | --- | --- |
| The story is wrong | Change the story or the component | Edit the board to hide it |
| The board is wrong | Edit the board, or ask the owner to | Change the app to match a stale board |
| The board is ahead of the app | Keep it, map it as not built with the reason, list it in an issue | Invent the figure in a fixture |
| They differ only in sample data | Mark the value on the board (`data-sample`) and read it in the story | Retype it in both |
| You cannot tell | Ask the owner with both versions | Pick one |

## When the snapshot conflicts

1. Merge the base branch into yours (`git merge`, not rebase).
2. In the generated snapshot files, take either side (`git checkout --ours` or `--theirs`); the
   refresh overwrites them. Never merge hashes, versions or board copies by hand.
3. Run a **full** refresh from the canvas. Without canvas access, leave the conflicted files as the
   base branch has them and ask someone who has.
4. Hand-kept map files are the exception: merge them by hand and keep both sides. The same board
   changed on both sides is a real decision; keep the side that matches the canvas and the story.
5. Run the check and the tests, then commit the merge.

## Traps

- **Every publish is a new canvas version.** Refresh after your own.
- **A canvas holds 512 files.** Every board, `canvas.json`, the tokens and an installed design
  system's files count. `check` warns when few are free; a warning does not fail it, but read it.
- **`check` warnings are not problems.** Lines starting `warning: ` never fail the check: missing
  boards a full refresh adds, a design system at another version, few free files, a `none` board
  that looks built, `tags` of the wrong shape. Act on them in
  the change that caused them.
- **`data-sample` goes on a leaf element**, written out, never on a `{{hole}}`.
- **A value shown twice gets a numbered key** (`ticket.pr`, `ticket.pr2`): a key marks one value, and
  the snapshot refuses a key used twice. Check a board you published before asking for approval.
- **`data-sample` and `data-component` are design-only attributes**: the markup comparison leaves
  them out, so they never reach the shipped markup.
- **Fonts and images from the canvas (`/_blob/…`) do not load offline**, so a board rendered in CI
  falls back to system fonts.
- **The Artifact tool is how the canvas is edited.** Do not claim you cannot edit it without
  trying; if a permission rule refuses the publish, stop and tell the owner rather than finding
  another way.

## Before you push

- The check passes, and a second refresh changes nothing.
- The pull request names the boards it touches or draws, whether the canvas was edited and at
  which version, and every disagreement left standing with its issue.
- A UX change carries its picture (`ux-picture`) and goes to the project's design reviewer.
