---
title: Security
description: Security model, threat boundaries, and contamination detection.
---

## Threat Model

Repo Dataset reads files from repositories and writes JSONL output. It does **not**:
- Make network requests
- Collect telemetry or analytics
- Access files outside the target repo and output directory
- Execute code from scanned repositories

### Attack Surface

| Vector | Mitigation |
|--------|-----------|
| Path traversal via JSON records | `isInsideRepo()` guard resolves and validates all paths |
| Symlink escape | `isSymbolicLink()` check skips symlinks during scanning |
| ReDoS via glob patterns | All regex metacharacters escaped before glob compilation |
| Malformed JPEG/PNG | Bounds-checked parsers with early-exit on invalid headers |
| Binary file pollution | Null-byte detection in first 8KB skips binary content |

## Contamination Detection

The `validate` command includes a contamination scan that checks training data for:

### Secrets
- AWS access keys (`AKIA...`)
- GitHub tokens (`ghp_`, `gho_`, `ghs_`)
- Generic API key patterns
- RSA private keys

### PII
- Email addresses
- IPv4 addresses

### Benchmark Leakage
- 15 HumanEval canonical function signatures (has_close_elements, separate_paren_groups, etc.)

Contamination findings reduce the validation score: -10 per secret, -5 per PII instance, -15 per benchmark match.

## Reporting Vulnerabilities

See [SECURITY.md](https://github.com/mcp-tool-shop-org/repo-dataset/blob/main/SECURITY.md) for reporting instructions. Response within 72 hours.
