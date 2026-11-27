---
name: security
base: security
---

- What this repository takes in and reaches: command-line arguments (board and file names, `--from` folders), canvas HTML and snapshot files read from disk, a project's hooks module loaded and run as code, and files written under the snapshot or picture folders.
- Where the sensitive code lives: file paths and folder reads in `src/` (a name from an argument or a file must not leave its folder), the hooks module loader in `src/hooks.ts`, and the HTML parsing of canvas files. Its dependencies are in `package.json`; a new one is a dependencies change.
- BLOCKING: a path built from a board name, argument or file content that can write or read outside the intended folder.

- Fetch the base branch (`origin/main`) before judging the diff. A defect another reviewer owns is raised once, by that reviewer.

- Accepted findings are not raised again. When your prompt lists findings of the ticket a person decided accepted (with their ids), do not raise one again, not as BLOCKING or OPTIONAL and not with a verdict of open: Tick-it drops a verdict of open on an accepted finding when the run is recorded and leaves it out of your blocking count. A new finding with different text is still raised.
