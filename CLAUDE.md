# Working in drawing-board

- **A pull request never changes the version.** Do not edit `version` in `package.json` or `plugin/.claude-plugin/plugin.json`: the `version` job in
  `.github/workflows/ci.yml` fails a pull request that does. After the merge to `main`, the `release` job raises the versions, commits the raise to
  `main`, tags `v<version>`, releases and publishes. Label the pull request `release:minor` or `release:major` for more than a patch (README, "Releasing").
