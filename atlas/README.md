# repo-dataset: how it works

Mapped at 2026-09-24 from commit 3665fc1.

## What this is

5 parts, mostly TypeScript (78 files). Work enters through 5 doors; the busiest is @mcptoolshop/repo-dataset, which reaches 1 part. It publishes to npm. People run repo-dataset. People import @mcptoolshop/repo-dataset.

## What changed since the last map

This is the first map.

## What comes in

1. **@mcptoolshop/repo-dataset** (the package people import). Loads src/index.ts.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **CI.** On a pull request touching 8 paths; on a push touching 8 paths; or by hand. Checks src/.
4. **Publish.** When a release is published. Checks src/.
5. **repo-dataset** (a command people run). Runs src/cli.ts.

## What happens through @mcptoolshop/repo-dataset

1. The package loads src/index.ts in src.

## Who reads the results

@mcptoolshop/repo-dataset writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**CI** checks src/.

**Publish** checks src/ and publishes to npm.

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

src/index.ts

Read those in order to follow one import of @mcptoolshop/repo-dataset end to end.

## What this map cannot see

- 8 reads use paths built at run time and are not named here.
- 9 writes and 17 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 2 commands are built at run time and not followed, 1 of them in tests.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 20 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
