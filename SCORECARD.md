# Scorecard

**Repo:** @mcptoolshop/repo-dataset
**Date:** 2026-04-17
**Type tags:** `[npm]` `[cli]`
**Version:** 1.2.1

## Post-Dogfood-Swarm Assessment

The dogfood swarm on 2026-04-14 (Health A/B/C + Feature Pass + Full Treatment) is the baseline. No formal pre-remediation snapshot exists because the repo was built clean; the scorecard reflects current state.

| Category | Score | Notes |
|----------|-------|-------|
| A. Security | 10/10 | SECURITY.md present; threat model in README; no telemetry; path traversal + symlink + ReDoS guards in place; structured error codes for disk/permission failures. |
| B. Error Handling | 10/10 | Structured `RepoDatasetError` shape (code/message/hint); CLI exit codes 0/1/2/3; no raw stacks without `--debug`; non-native exceptions wrapped (`DISK_FULL`, `PERMISSION_DENIED`, `OUTPUT_WRITE_FAILED`). |
| C. Operator Docs | 10/10 | README current for v1.2.1; CHANGELOG Keep-a-Changelog; LICENSE MIT; `--help` accurate; handbook (5 pages) deployed; HANDOFF.md refreshed 2026-04-17. |
| D. Shipping Hygiene | 10/10 | `npm run verify` = build + 460 tests pass; `engines.node >=20`; lockfile committed; `npm pack --dry-run` = 83 files / 245 kB (71% smaller post-swarm); CI Node 20+22 matrix; Dependabot monthly grouped. |
| E. Identity (soft) | 10/10 | Logo in README header; 7 translations (ja, zh, es, fr, hi, it, pt-BR); landing page live at `mcp-tool-shop-org.github.io/repo-dataset/`; GitHub description + homepage + topics set. |
| **Overall** | **50/50** | All hard gates pass (A-D), soft gate (E) complete. |

## Key Evidence

- `npm run verify` → 460/460 passing, 91 suites, ~3s runtime
- `npm pack --dry-run` → 83 files / 245 kB
- Shipcheck A-D: all items checked or SKIP-justified in `SHIP_GATE.md`
- CI status: green (see repo actions)

## Known Open Items (not blocking)

These are not gate failures — they are deferred-by-design pending M5 Max arrival (~2026-04-24):

1. **Real-world adoption receipts** — contamination-caught-leak examples, letter-grade scorecards from actual training runs
2. **Canon binding data** — style-dataset-lab needs `canon_assertions` populated to exercise visual triangle completion
3. **Parquet / WebDataset output** — for datasets > 50K examples (future enhancement)

## Scorecard Rules Used

Scoring is evidence-based per-category out of 10. Hard gate sections (A-D) only score 10 when every applicable item in `SHIP_GATE.md` is checked and the verify script passes. Soft gate (E) scores 10 when logo + translations + landing + GitHub metadata are all present.
