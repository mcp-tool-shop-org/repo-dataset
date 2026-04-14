---
title: Repo Dataset Handbook
description: Complete guide to producing scientific-grade LLM training data from code and visual repos.
sidebar:
  order: 0
---

Repo Dataset converts git repositories and visual style repos into JSONL training datasets for LLM fine-tuning.

## What It Does

**Code pipeline** extracts training signal from 5 sources — code, commits, documentation, tests, and configuration files — then deduplicates, balances, and formats the output for fine-tuning frameworks.

**Visual pipeline** processes curated image repos (sprites, concept art, style guides) into multimodal training data with binding integrity: every unit links an image, a canonical explanation, and a quality judgment.

## Why It Exists

Training data quality determines model quality. Repo Dataset treats dataset construction as a scientific process:

- **MinHash near-dedup** removes both exact and fuzzy duplicates
- **Contamination validation** catches leaked secrets, PII, and benchmark data before training
- **Quality scoring** with letter grades measures dataset health
- **Binding integrity** ensures visual training units have complete signal triangles
- **Provenance tracking** records which file, commit, and extractor produced each pair

## Quick Start

```bash
npm i -g @mcptoolshop/repo-dataset
repo-dataset generate ./my-project --format chatml --validate
```

## Handbook Contents

- [Getting Started](./getting-started/) — Install and generate your first dataset
- [CLI Reference](./reference/) — Complete command and flag reference
- [Architecture](./architecture/) — How the pipeline works
- [Security](./security/) — Threat model, contamination detection
