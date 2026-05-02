# TStack Maintenance

TStack is Tyler Huntington's small patch fork of `garrytan/gstack`.

The maintenance rule is: keep upstream source layout intact, keep Tyler-specific
changes small, and sync from upstream through reviewable pull requests.

## Remotes

```bash
origin   https://github.com/tylerhuntington/tstack
upstream https://github.com/garrytan/gstack.git
```

## Sync Workflow

A scheduled GitHub Action runs weekly and can also be triggered manually:

- Fetch `upstream/main`.
- Create or update `chore/sync-upstream`.
- Merge upstream into that branch.
- Run `bun install --frozen-lockfile`.
- Run `bun run build`.
- Run `bun test design/test/auth.test.ts`.
- Open or update a pull request into `main`.

Do not auto-merge upstream syncs until the fork has several clean cycles.

## Local Sync

```bash
cd ~/dev/tstack
git checkout main
git fetch origin upstream --prune
git checkout -b chore/sync-upstream-$(date +%Y%m%d)
git merge --no-edit upstream/main
bun install --frozen-lockfile
bun run build
bun test design/test/auth.test.ts
git push -u origin HEAD
```

## Custom Patch Policy

Keep custom changes generic enough to upstream when possible. Prefer:

- provider-neutral configuration such as `OPENAI_BASE_URL`
- install/runtime fixes that help all Codex users
- small patches with focused tests

Avoid:

- broad source renames from gstack to TStack
- generated binary commits
- local secrets or hardcoded API keys
- one-off changes that create avoidable upstream merge conflicts

## Current TStack Patch

The designer supports OpenAI-compatible providers by honoring:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- optional `~/.gstack/openai.json` fields `api_key` and `base_url`

For C/Borg:

```bash
export OPENAI_API_KEY="$CBORG_API_KEY"
export OPENAI_BASE_URL="https://api.cborg.lbl.gov"
```

C/Borg authorizes the client IP address. On dual-stack networks the key manager
may authorize IPv6 while some API clients connect over IPv4 and receive a 403.
The TStack designer forces IPv6 for `api.cborg.lbl.gov` requests. Set
`OPENAI_FORCE_IPV4=1` to disable that behavior, or `OPENAI_FORCE_IPV6=1` to
force IPv6 for another OpenAI-compatible endpoint.

The setup script also links `design/dist` into the Codex runtime root so
`/plan-design-review` can find the designer without a manual symlink.
