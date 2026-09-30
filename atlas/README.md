# repo-dataset: how it works

Mapped at 2026-09-30 from commit b3caf9f by Atlas 1.24.0.

## What this is

5 parts, mostly TypeScript (78 files), CSS (2), Astro (1) and JavaScript (1). Work enters through 5 doors; CI, Deploy site to GitHub Pages, Publish, @mcptoolshop/repo-dataset and repo-dataset each reach 1 part, and CI is followed because a pull request goes through it. It publishes to npm. It deploys a site to GitHub Pages. People run repo-dataset. People import @mcptoolshop/repo-dataset.

## What changed since 2026-09-24 (3665fc1)

- CI's pull request trigger now also names `codecov.yml`.
- CI's push trigger now also names `codecov.yml`.
- CI now also runs src/tests/extractors/code.test.ts, src/tests/extractors/commits.test.ts, src/tests/extractors/docs.test.ts and 11 more.
- And 1 more change to a door.
- 1 file added and 129 changed content, across 5 parts.

## What comes in

1. **CI.** On a pull request touching 9 paths; on a push touching 9 paths; or by hand. Runs src/tests/extractors/code.test.ts, src/tests/extractors/commits.test.ts, src/tests/extractors/docs.test.ts and 11 more; builds src/.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **Publish.** When a release is published. Runs src/tests/extractors/code.test.ts, src/tests/extractors/commits.test.ts, src/tests/extractors/docs.test.ts and 11 more; builds src/.
4. **@mcptoolshop/repo-dataset** (the package people import). Loads src/index.ts.
5. **repo-dataset** (a command people run). Runs src/cli.ts.

## What happens through CI

1. The workflow runs 14 files in src; it builds src/ in src.
2. It uploads coverage to Codecov.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**Publish** runs src/tests/extractors/code.test.ts, src/tests/extractors/commits.test.ts, src/tests/extractors/docs.test.ts and 11 more, builds src/, and publishes to npm.

**@mcptoolshop/repo-dataset** (the package people import) loads src/index.ts.

**repo-dataset** (a command people run) runs src/cli.ts and runs git.

## What breaks what

- **src** is imported by no other part and sits on the path of 4 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .github/, docs/, the repository root and site/. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → src/index.ts → src/pipeline/runner.ts → src/discovery/scanner.ts → src/discovery/git.ts → src/extractors/registry.ts → src/formatters/registry.ts → src/pipeline/quality.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 8 reads use paths built at run time and are not named here.
- 9 writes and 12 reads go to a path their caller passes, not to this repository.
- 5 reads go to the directory the command is run in (.github/, package-lock.json, package.json and 2 more places), not to this repository.
- 1 command is built at run time and not followed.
- 19 test files under `src/tests/` are not run by CI and Publish on Linux, where the shell expands `**` as one directory level.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
