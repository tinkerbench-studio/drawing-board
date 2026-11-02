---
name: flow-pages
description: How a project's design canvas is split into pages, one per user flow, so a board is found by the journey it belongs to and each page stays small enough to review. Use when adding a board (which page it joins), when a page has grown past about twenty boards or mixes journeys, when boards have no page, and when planning or reviewing a reorganisation of the canvas.
---

# One canvas page per flow

A page holds one **flow**: a journey a person takes from a starting point to an outcome
("sign up", "forward a booking email", "upgrade a trip", "review a training case"). A board belongs
to the flow it is a step of. The project's pages are listed in `.claude/drawing-board.md`, each with
the flow it covers and the board name prefixes it holds.

## Why flows, not areas

- **Found by journey.** Someone reviewing a change to a journey sees every step of it, its states
  and its phone views in one place.
- **Small pages.** A page of a few dozen boards can be read in one sitting and reviewed whole.
- **Fewer clashes.** With per-board snapshot files a page is just a field on each board, but a
  smaller page still means fewer people publishing to it at once.

## What goes on a flow page

- Every step of the flow, in order, desktop first, then its phone view beside it.
- Its states (empty, error, loading, refused) next to the step they belong to.
- Its build spec board, if the project keeps one, at the end of the page.
- Light variants beside their dark ones, where the project has both.

What is not a flow goes on its own page:

- **Shared components and patterns** (a dialog, a copy button, a picker) on a `patterns` page.
- **Error pages** on an `errors` page.
- **Prototypes** on a page per ticket (`design-change`), never on a flow page.

## Choosing pages

1. List every board with its title and current page.
2. Group by the outcome a person is after, not by the section of the app it sits in. A settings
   screen used only to connect an app belongs to the "connect an app" flow.
3. Split a group past about twenty boards by its sub-journeys (an account page might split into
   "your details", "apps and keys", "preferences", "notifications").
4. Give every board a page. A board with no page is unreviewable.
5. Name each page by its flow, as a short lowercase id (`forwarding`, `upgrade`, `admin-users`), and
   give it a title a person reads ("Forward your bookings").
6. Write the table into `.claude/drawing-board.md`: page id, the flow in one line, and the prefixes
   of its boards.

## Moving boards between pages

Moving a board changes only its page, not its content. Do a reorganisation as one publish of the
canvas's page index, then a refresh (`canvas-sync`). Where the project still keeps all boards in one
snapshot file, do the reorganisation in the same change that splits the snapshot per board, so the
big rewrite happens once.

## Adding a board

A new board joins the page of the flow it is a step of. If no flow fits, that is a new flow: add
the page and its row in `.claude/drawing-board.md` in the same change.
