---
title: Repo Dataset Handbook
description: The dataset construction and verification layer for local ML workflows — contamination-aware, quality-scored, trainer-ready.
sidebar:
  order: 0
---

repo-dataset is the dataset construction and verification layer for local ML workflows. Not a trainer. Not a format zoo. It sits between your source material — git repos, visual canon, scattered JSONL — and whatever framework actually consumes the training data.

## Why this exists

Training frameworks own training. Public-dataset libraries own downloading and loading HuggingFace-scale corpora. The lane in the middle — construct a dataset from your own repositories, detect contamination before a training run burns, and verify quality with a grade you can act on — is the one nobody owns by default. repo-dataset is built for that lane. If your source material is private, mixed across repos, and destined for a local LoRA or VLM run, this is the layer you have been wiring by hand.

## When to reach for it

- Fine-tuning a local model on your own codebase and you want HumanEval-leak protection before the run starts
- Curating a visual dataset for VLM fine-tuning — sprites, concept art, style references — with the image + canon + judgment triangle enforced
- Merging training data from several repos and you need MinHash dedup that works across sources, not just within one file
- Validating a JSONL dataset's quality grade before committing GPU hours to it
- Piping output directly into [backpropagate](https://github.com/mcp-tool-shop-org/backpropagate) for a local LoRA run

## What it is / what it isn't

- **Not a trainer.** It does not fine-tune models. Hand its output to backpropagate, Axolotl, Unsloth, or LLaMA-Factory.
- **Not another format converter.** Format support exists because training frameworks disagree on shape; the work is in the construction and verification around that shape.
- **A dataset construction and verification layer for local ML workflows.** Extract, dedup, score, and validate — so the training run starts from material you trust.

For specialized canon-and-visual dataset work, [style-dataset-lab](https://github.com/mcp-tool-shop-org/style-dataset-lab) is the deeper system; repo-dataset is the broader construction and verification layer. They complement each other.

## Quick start

```bash
npm i -g @mcptoolshop/repo-dataset
repo-dataset generate ./my-project --format chatml --validate
```

## Handbook contents

- [Getting Started](./getting-started/) — Install, contamination check, first dataset
- [CLI Reference](./reference/) — Complete command and flag reference
- [Architecture](./architecture/) — How the pipeline works
- [Security](./security/) — Threat model, contamination detection
