---
name: ux-picture
description: The picture a UX bug or a pull request with a UX effect carries — the design canvas board and the Storybook story side by side under source banners, the differences boxed, numbered and colour-coded with a table, and the before for a fix — how to make it from the committed snapshot and how to put it on the ticket or pull request. Use whenever raising a UX bug, opening or updating a pull request that changes what a person sees, or reporting a difference between a board and its story.
---

# Showing a UX bug or fix with a picture

Words alone about layout are too easy to misread. A UX bug, and a pull request that changes what a
person sees, carries a picture: the board and the story side by side. Read
`.claude/drawing-board.md` for the project's picture and upload commands.

## What the picture is

- **Two sides at the same width**, each under a banner that is part of the image and says where it
  came from, so anyone can find it again:
  - **DESIGN CANVAS** (blue): the board file and any boards it imports, the canvas link, and the
    version (the snapshot's, or "read live" with the version a read reported).
  - **STORYBOOK** (orange): the story title and id, its fixture, the build or commit it was shot
    from, and whether the page's scripts ran.
  - A side that is neither (a built page rendered from a fixture) is labelled for what it is, with
    its component, route and fixture.
- **A close-up** of the part in question.
- **Each difference boxed on both sides** with the same number and its own colour (box, number badge
  and the table's row in that colour, so a difference can be followed by colour alone). The number
  is a large coloured digit on a white badge at the box's corner, moved where it would hide text. No
  box on a side that does not draw the difference.
- **A table** giving each number a title and one sentence, what was ruled out as not a difference
  (a fixture's or the browser's doing), and which data was aligned and which was not.
- **A fix shows before and after.** Shoot the base branch in a separate worktree for the before, or
  use the board as the before when the fix moves toward it.

Never show a bare screenshot, and never a comparison that leaves the differences for the reader to
find.

## Check it before handing it on

- Every number in the table is a box in the image, and every box has a row.
- Every width, size and count in a row is read from the picture or the source, not remembered.
- A row says what is missing in full ("the whole card is missing", not "the values are plain
  text").
- The list is complete for what is visible: a row left out reads as "only this differs".
- Look at both sides before writing about them. A compare report lists wording, not what is on
  screen.

## Scripts run

A page its own scripts change is shot with them run, never as the markup stands before they do.
The banner says which scripts ran, or that none did.

## When there is nothing to put side by side

Show what exists and say what is missing: no board for the screen (the story alone), a board that
cannot be rendered from the snapshot, a new screen (the after alone), or a copy or token change
(before and after of the one place it shows).

## Making it

`drawing-board annotate --board <Board>.dc.html` makes it from the committed snapshot and a built Storybook: the banners, the numbered colour-coded boxes and the table, with the differences from `<snapshot>/differences/<Board>.json` or found by comparing wording. Check its table against the picture all the same. By hand: serve the snapshot's board copies
(never the live canvas) over HTTP and open the board in Chromium; shoot the story from Storybook's
`iframe.html?id=<story id>`, at full height; add the banners and boxes in the page before the shot,
then join the two images.

## Putting it on the ticket or pull request

- With `gh` 2.102 or later and push access, `gh issue comment N --body-file body.md --attach
  shot.png` (and `gh pr create` / `gh pr edit`) uploads the file and rewrites its local path in the
  body. A Claude Code session usually cannot: its proxy refuses the upload.
- A session uses the project's upload command and puts the links it prints in the body. Upload only
  pictures of fixture or story renders, never a signed-in or real-data page.
- If the upload fails, post the table and the text, write "Images owed: <file names>" where the
  pictures belong, and get the files to the owner (send them, or name their paths). Never describe
  a picture the body does not have.
