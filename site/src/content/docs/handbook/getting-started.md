---
title: Getting Started
description: Install repo-dataset, run a contamination check, and produce your first verified training dataset.
sidebar:
  order: 1
---

## Install

```bash
npm install -g @mcptoolshop/repo-dataset
```

Requires Node.js 20 or later. Zero runtime dependencies. v1.2.0, 460 tests passing.

## The contamination check

Before generating anything, know what the validator does — it is the reason this tool exists. Point it at any JSONL dataset and it reports a letter grade, contamination counts, and structural health.

```bash
repo-dataset validate ./some-dataset.jsonl
```

Output shape (illustrative — actual counts depend on your data):

```
Dataset: ./some-dataset.jsonl
Grade:   B

Structure
  records              <n>
  schema valid         <n>/<n>
  distribution         balanced | skewed

Contamination
  leaked secrets       <count>
  PII patterns         <count>
  HumanEval signatures <count>

Quality
  duplicates (MinHash) <count>
  short records        <count>
  empty fields         <count>

Recommendations
  - <actionable items, if any>
```

MinHash LSH runs at 64 hashes, 8 bands, threshold 0.8. The HumanEval check scans for known benchmark signatures so leaked test questions do not quietly enter your training set. Run this before you burn GPU hours.

## Generate a code dataset

Point it at a git repo. Five extractors (code, commits, docs, tests, configuration) produce training pairs, dedup runs, and JSONL is written.

```bash
repo-dataset generate ./my-project --format chatml
```

Seven code formats are supported: `chatml`, `alpaca`, `sharegpt`, `openai`, `completion`, `fim`, `raw`. Pick the shape your trainer expects.

## Generate a visual dataset

Visual generation enforces the **triangle**: every unit links an image, a canonical explanation, and a quality judgment. Units missing any side are rejected — you cannot ship a visual dataset with orphan images or ungraded samples.

```bash
repo-dataset visual generate ./my-visual-repo --format llava
```

Ten visual formats are supported, covering VLM fine-tuning shapes across the common trainers.

## Validate any JSONL file

`validate` is standalone. It does not care whether repo-dataset produced the file — point it at any JSONL and get a grade.

```bash
repo-dataset validate ./external-dataset.jsonl
```

## Generate and validate in one step

Add `--validate` to `generate` and both run back-to-back. The grade is emitted before the command exits, so CI can gate on it.

```bash
repo-dataset generate ./my-project --format chatml --validate
```

## End-to-end with backpropagate

```bash
repo-dataset generate ./my-project --format chatml --pipe-to-backpropagate
backprop train --data ./my-project-dataset/dataset.jsonl --steps 300
```

Backpropagate auto-detects the format from field names. Use `chatml` for Mistral/Hermes, `alpaca` for LLaMA, `openai` for GPT-style training.
