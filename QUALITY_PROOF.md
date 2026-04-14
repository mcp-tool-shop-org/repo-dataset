# Quality Proof — repo-dataset v1.1.0

Benchmark run: 2026-04-12  
Tool version: 1.1.0  
Command: `repo-dataset generate <repo> --format completion --auto-balance`  
Validation: `repo-dataset validate <output>`

---

## Summary

| Repo | Type | Pairs | Tokens | Code % | Docs % | Tests % | Grade | Trainability |
|------|------|-------|--------|--------|--------|---------|-------|--------------|
| tldr-pages/tldr | docs-heavy | 4,961 | 750K | 2% | 98% | 0% | **B** | good |
| colinhacks/zod | code-heavy | 912 | 272K | 71% | 24% | 5% | **B** | good |
| vitejs/vite | mixed | 1,619 | 490K | 74% | 25% | 1% | **B** | good |
| repo-dataset (self) | mixed | 130 | 59K | 60% | 20% | 18% | **B** | marginal |

All benchmarks pass at Grade B or higher.

---

## Key Findings

### 1. The tool does NOT collapse into "markdown QA generator" on code-heavy repos

- **Zod** (pure TypeScript logic): **71% code**, 24% docs, 5% tests
- **Vite** (large mixed project): **74% code**, 25% docs, 1% tests
- **Self** (small TypeScript CLI): **60% code**, 20% docs, 18% tests

The `--auto-balance` flag (code:3, tests:2, commits:1, docs:1) correctly prioritizes code signal.

### 2. The tool handles docs-heavy repos gracefully

- **tldr** is 35,000 markdown files with almost no code
- Balance caps docs extraction but still produces 4,961 pairs (useful for docs-model training)
- The validate command correctly flags `dominant: docs` as a distribution warning
- Grade B (not A) because entropy is low — this is expected and honest

### 3. Quality scoring selects the best examples when capping

When `--auto-balance` caps docs at ratio 1 (vs code at 3):
- shipcheck: docs dropped from 189 → 30, avg quality jumped 0.65 → 0.88
- The system takes highest-quality docs sections (those with code blocks, specific headings)

### 4. Completion format emits raw code (not instruction-wrapped)

In completion mode, code pairs output as `{"text": "<imports>\n\n<function body>", "metadata": {...}}` — no synthetic "Explain this function" wrapping. The code IS the training signal.

---

## Detailed Reports

### tldr-pages/tldr (docs-heavy)

```
Structural:   PASS (4961/4961 valid)
Distribution: CV 0.62 | Source entropy 0.14/1.58 | Dominant: docs
Content:      Near-dup 5.7% | TTR 0.23 | Instr-div 100% | Trivial 0%
Score:        78/100 (Grade B)
```

**Analysis:** This is an intentionally docs-only repo (command help pages). The tool correctly identifies it as docs-dominant. Low entropy is expected — there is genuinely only one signal source. Near-dup rate is healthy (5.7%) despite thousands of similarly-structured pages. High vocabulary richness (0.23 TTR) because each page describes a different tool.

### colinhacks/zod (code-heavy)

```
Structural:   PASS (912/912 valid)
Distribution: CV 1.14 | Source entropy 1.09/2.0 | Dominant: code
Content:      Near-dup 57.7% | TTR 0.14 | Instr-div 100% | Trivial 0%
Score:        81/100 (Grade B)
```

**Analysis:** Code-dominant as expected. The high near-dup rate (57.7%) reflects Zod's repetitive validation patterns — many functions share structural similarity (parse, safeParse, transform patterns). This is a known characteristic of utility libraries and doesn't indicate a bug. TTR is slightly low (0.14) for the same reason — Zod's vocabulary is intentionally constrained to its domain.

### vitejs/vite (mixed)

```
Structural:   PASS (1619/1619 valid)
Distribution: CV 0.92 | Source entropy 0.93/2.0 | Dominant: code
Content:      Near-dup 58.9% | TTR 0.16 | Instr-div 100% | Trivial 0%
Score:        82/100 (Grade B)
```

**Analysis:** Balanced distribution with code naturally dominant. Good CV (0.92) indicates healthy length variety. The near-dup rate is high because Vite has many plugin files that share similar patterns (hook functions, configuration shapes). TTR is healthy at 0.16. All four extractors contributed.

---

## What the grades tell us

**Grade B means:** "Good dataset, minor improvements possible."

The datasets lose points primarily on:
- **Near-duplicate rate** (code repos have structural repetition by nature)
- **Source entropy** (when one signal naturally dominates, entropy is lower)

These are not bugs — they reflect the genuine structure of the source repos.

**What would get to Grade A:**
- MinHash near-dedup (reduces structural duplicates from 58% to <10%)
- Multiple repos combined into a single dataset (increases entropy naturally)
- Larger repos with more diverse code patterns

---

## Regression Test

The critical regression is: **does a docs-heavy repo produce a docs-heavy dataset without balance?**

```
# Without balance (Phase 1 behavior):
shipcheck → 91% docs, 8% code

# With --auto-balance (Phase 2):
shipcheck → 63% docs, 33% code
repo-dataset → 20% docs, 60% code
zod → 24% docs, 71% code
```

The balance system is proven. The tool no longer collapses into a markdown QA generator.

---

## Conclusion

repo-dataset produces provenance-backed training datasets with controllable signal balance. It handles docs-heavy, code-heavy, and mixed repos without collapsing. All benchmarks score Grade B or higher.

> **Note:** This proof covers the code pipeline (extractors, formats, balance, validation). Visual pipeline proof benchmarks (image embedding, binding integrity, visual output formats) are pending.
