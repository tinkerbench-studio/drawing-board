---
name: design-audit
description: The audit that compares a project's design canvas with its Storybook pages and raises one issue per page, with evidence, for the real differences nobody has raised yet. Checks the snapshot is current, runs the drawing-board checks, shoots an annotated picture of each page, checks for an existing open issue before and again just before raising one, and changes no code. Use whenever asked to audit, compare or check the design against Storybook, and in a scheduled audit session.
---

# Auditing the design canvas against Storybook

The design canvas holds the designs and Storybook holds how they are built (`canvas-sync` says which
side owns what). This audit looks for where they have drifted and puts each page's differences in front
of the owner as one issue, with a picture. It can run on a schedule, in a fresh session each time, and it
can be run by hand. Read `.claude/drawing-board.md` first: it names the project's commands, tracker,
labels and upload step, and it wins over this skill on conventions.

**It is an audit, not a fix.** Commit and push nothing, open no pull request, and claim or move no ticket.
The only things it leaves behind are issues and comments on issues. Any file it makes to shoot a picture
(a scratch copy of a tool, a differences list) is untracked and deleted before it finishes.

## Setup

- If the repository is not in the working directory (a scheduled session may start without it), attach it
  the way the session allows and clone it.
- Install the project's dependencies if they are missing, and make sure a Chromium can be found
  (`drawing-board browser` says which one the commands would start and why).
- Load the tracker's tools if they are not loaded. If the repository still cannot be read or issues cannot
  be raised, stop and say exactly what was missing; do not guess.
- Read `canvas-sync` and `ux-picture`.

## The audit

1. **Is the committed snapshot current?** Read the canvas artifact the snapshot's record
   (`artifact.json`) names, and compare its published version with the newest copy version in the boards'
   meta files (each board records the version of its own copy, so an older one on another board is not
   stale). If the canvas is newer, raise, or comment on, one issue saying the snapshot is stale with both
   versions, unless an open issue already says so. It does not count towards the limit in step 7. Do not
   refresh it: that is a change to the repository. Audit against the committed snapshot either way.
2. **Run the checks.** `drawing-board check` and `report`, the project's own story and comparison steps,
   then `compare` and `layout`. These reports are advisory and list wording and landmark boxes, not what is
   on screen: look before you claim. A few unrelated failing stories do not stop the markup being written;
   name them in the summary.
3. **Shoot each page.** `drawing-board annotate --board <Board>.dc.html` draws only the differences already
   listed for that board in its differences file, and only a board the project's layout screens include; it
   finds none itself. So, for a board with a list, run it and look at the picture. For a listed board whose
   list is out of date, or a page the audit found differences on that has none, write the list as an
   untracked file for the run and delete it after. For a board that cannot be shot, show the story alone and
   say so in the issue (`ux-picture`, "When there is nothing to put side by side"). A page its scripts change
   is shot with them run: the command loads the scripts its markup has a hook for, and says "scripts did not
   run" for a page with none to load, so check the page's route for scripts the command has no hook for. For
   such a page do not put the picture in an issue: leave it out and say which differences it would have
   shown. **Not a difference:** canvas images that do not load offline, the stand-in font, data that is only
   the fixture's, and a state the board draws and the story does not by design.
4. **Tokens and components.** Check the colours, type, radius and spacing in the snapshot's tokens against
   the CSS, and the components the boards draw against their stories. Group each difference under the page
   (board) it shows on. One that shows on no single page, or on most of them, gets an issue of its own.
5. **Check for an existing open issue** before you raise anything, and again immediately before each issue
   you create: a person or another session may have raised it since you started. Search by the board file
   name, the page's title, its story id and its route or screen name, and list the open issues of each label
   the project uses for design and bugs, reading titles and bodies for the page. A search tool may not
   honour a state filter in the query, so read each hit's own state. Read any that look close, comments
   included. Then:
   - **An open issue about the page exists:** raise nothing. Comment on it only for a difference it does not
     already name, with the evidence; if it names them all, add nothing.
   - **Only a closed issue exists:** raise a new one only for a difference that is not what the closed issue
     fixed, and link it. A difference that brings back what a closed issue fixed is a regression, and the
     issue says so.
   - **Nothing exists:** raise the issue (step 6).

   Never raise a second issue for a page, and never one for something the owner has already decided in an
   existing issue's comments.
6. **Raise one issue per page**, not one per difference. Title it for the page and give it a numbered list
   of every real difference on that page: what differs, where (board file and selector, story id, fixture),
   and what is known and not known, with a suggested fix and its cost if there is one. Put one annotated
   picture of the page in it, every difference boxed and numbered, with its table (what each number is,
   what was ruled out as not a difference, which data was aligned), as `ux-picture` says.
   - **The picture:** upload it with the project's upload command, naming the fixture it was made from and
     never one it was not (upload only fixture or story renders), and embed it the way the project's file
     says: some tracker tools rewrite a markdown image into a plain link, in which case use an `<img>` tag.
     Only if the upload really fails, say "Images owed" and name the file, and send it to the owner where the
     session can; a scheduled session's container is reclaimed, so say in the summary that an unsent picture
     is lost.
   - **Labels:** a kind (a bug where the build is wrong against a design the owner has settled, an
     enhancement where the design is the newer thing), the design area, and every other area that fits; a
     question as well when the owner must choose which side moves; a size and complexity when you can judge
     them (an issue over the largest size is the owner's to split, and the issue says so). Leave priority
     labels off a bug: the owner sets them at triage.
   - End with the project's footer for agent-written issues, if it has one.
7. **At most five new issues in a run** (a project may set another limit), the pages with the most visible
   differences first. List the rest in the summary rather than raising them.
8. **Finish with a summary:** the snapshot and canvas versions; the issues raised and commented on, each as
   a link; for each page skipped, whether an open issue already covers it or it has no real difference; and
   anything that stopped the run (a failing command, a missing credential). If nothing new was found, say so
   and raise nothing.

## What the project's file adds

Its tracker and how issues are raised there, its labels and footer, the run limit if it differs, the upload
command and where the picture goes, the commands for the story and comparison steps, which boards its layout
screens include, and where its differences lists live.
