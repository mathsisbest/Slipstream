# Supply-chain check on dependency PRs

An agent adding a dependency is a real risk: a typosquatted or freshly-compromised package can land in a PR that otherwise looks clean. `guard-bash.sh` already asks before an install happens locally. This adds a second check at the PR boundary.

## Socket

[Socket](https://socket.dev) is a GitHub App that posts a behavioral report when a PR changes dependencies (`package.json`, `requirements.txt`, `go.mod`, etc.). It flags things a version number can't tell you: a package that newly added install scripts, network access, filesystem access, or obfuscated code. It catches problems before a CVE exists.

- Free tier covers a real amount of scanning for a solo dev or small project.
- Install is one click; no config to write.

## Set it up

1. Go to [github.com/apps/socket-security](https://github.com/apps/socket-security) and install it on your repo (or org).
2. Open a PR that touches a manifest file. Socket comments with its report.
3. Read the report on any PR that adds or bumps a dependency. Treat a flag as a reason to look closer, not as an auto-block.

## Where this fits

This is the PR-time layer. `guard-bash.sh` (the local install prompt) is the build-time layer. Together: the agent can't quietly install a package, and a changed manifest gets a behavioral scan before you merge.

> Note: Socket is a real, widely-used third-party service. Other scanners exist; the point is to have *a* behavioral supply-chain check on dependency PRs, not specifically this one.
