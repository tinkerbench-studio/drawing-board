---
name: design-change
description: How a design change is made in a project with a design canvas — any request to design, redesign, add to, move or reword something a person sees (a screen, panel, component, its layout or copy), whether it comes as a ticket, a canvas comment or a chat message. The design is worked out on a prototype page named after the ticket, moved onto the real board on the owner's go-ahead, and only then built in code and Storybook. Use whenever a design change is asked for, before touching components, stories, stylesheets or any canvas board for something new, and whenever a UX ticket asks for something new rather than reporting a bug.
---

# Changing a design

The canvas is where a design is decided. The code follows the board, never the other way round,
so a design change starts on the canvas and reaches the code last. `canvas-sync` has the mechanics
of publishing and refreshing; this skill is the order to work in. Read `.claude/drawing-board.md`
first for the project's canvases, pages and ticket key.

## Before you publish: the free files

A canvas holds at most 512 files of its own, and a publish over that is refused with a 422. A design
adds about four files: dark, light and a 390 px view of each. Before you publish a prototype, and
again before you fold one in, check that the canvas you publish to has enough free files: run
`drawing-board status --from <folder>` on a fresh read for the current count (`drawing-board check`
gives the count at the last refresh). When it has too few, stop: set the ticket to need a person,
say how many files are free and how many the design needs, and do not publish. Never delete another
board to make room; a board is deleted only when its design is deprecated. The canvas stays the
source of truth after a design is built: a board that is built stays on the canvas, and later
changes to it start there.

## The flow

1. **Make a prototype page for the ticket**, named by its key (`NOK-123`, `TCK-45`). One page per
   ticket, so two tickets' prototypes never sit on the same page. When the project has a
   `prototypes` canvas, the page goes there; otherwise on the main canvas, as before. Prototype pages are never read
   into the snapshot. A project whose snapshot cannot yet skip per-ticket pages says so in
   `.claude/drawing-board.md` and names the one page to use instead; follow that, and prefix each
   copy with the ticket key so two tickets' copies stay apart.
2. **Copy, do not move.** Copy each board you will change onto it as a new file
   (`Proto<Board>.dc.html`), the whole screen so the change is seen in context. A new screen is
   drawn there from the library's components and tokens. When a design system is installed on the
   canvas, mount its components (`<x-import component-from-global-scope="…">`) rather than copying
   their markup, so the board follows the system.
3. **Draw every variant the change needs**: dark and light where the project has both, and a
   phone view of each. Where there is a real choice, show each option beside the other and say
   what each costs.
4. **Mark sample data now.** Every value a board displays (a name, a figure, a date, a row's text)
   is marked `data-sample="group.name"` on a leaf element, so the agreed board moves onto the main
   page without rework and the story can read the same values. Fixed wording is not marked.
5. **Look before you show.** Render the prototype and screenshot it. Measure the tallest state and
   set the board's height to it, so nothing is cut off. Prefix a prototype's own CSS classes so they
   cannot clash with the shared stylesheet. Fix what is broken.
6. **Show the owner** the canvas link, what changed and what is open. Do not build, and do not
   open a pull request that changes what a person sees, from a prototype.
7. **Apply feedback** until the owner agrees.
8. **On the go-ahead, fold in, in one step:** check the free files on the main canvas first (above).
   Move the agreed boards onto their flow's page (`flow-pages`), delete the prototype page, publish
   only the files you changed, and refresh the snapshot for those boards (`canvas-sync`). With a
   `prototypes` canvas, fold-in copies the agreed boards to the main canvas and removes the prototype
   page from the prototypes canvas in the same change. Map each new board to its story, or say it is not
   built yet. Record the folded boards and the canvas version on the ticket. A design-only ticket
   still refreshes the snapshot in its own pull request; it does not leave that to the build.
9. **Then the code.** Build the agreed board as a component or page in Storybook from the library's
   components and tokens, then put the app behind it.

## Before you ask the design reviewer

The same few findings recur after the push. Check them yourself on the stories you built:

1. **Board beside story.** Run `drawing-board compare` (or the command `.claude/drawing-board.md` names). A difference you leave goes in the pull
   request with which side is right.
2. **Controls.** Every input, select, textarea and button is styled by the project's classes, not
   left as the browser's.
3. **Badges and chips** are the board's, from the shared stylesheet, not a new class.
4. **The phone.** Each changed story at phone width: nothing clipped, nothing scrolling sideways,
   targets 44 px or more, with the longest real value, not the short sample.
5. **States.** Every state the change draws (empty, long, filtered, error) has a story.
6. **Screen readers.** A count or mark beside words is hidden from the text it sits in and given
   its meaning in a label, so it is not read as part of the words.

Say in the pull request which you ran and which you could not, and why.

## Rules

- **Ask before publishing a main board** unless the owner asked for that edit in this session.
  Your ticket's prototype page needs no asking.
- **A request for a design change is answered on the canvas first.** Its code waits for the
  go-ahead; say so on the ticket.
- **A bug is not a design change.** An app that differs from an agreed board is fixed in the code
  (`canvas-sync`, "When a board and its story disagree").
- **No invented data.** A value on a board is sample data, never presented as real.
