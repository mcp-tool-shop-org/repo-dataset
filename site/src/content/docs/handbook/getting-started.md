---
title: Getting Started
description: Install and generate your first training dataset in under 2 minutes.
sidebar:
  order: 1
---

## Install

```bash
npm install -g @mcptoolshop/repo-dataset
```

Requires Node.js 20 or later. Zero runtime dependencies.

## Generate Code Training Data

Point it at any git repo:

```bash
repo-dataset generate ./my-project --format chatml
```

This scans the repo, extracts code/commits/docs/tests, deduplicates, and writes JSONL output.

## Choose a Format

| Format | Use Case | Consumer |
|--------|----------|----------|
| `chatml` | Local LoRA fine-tuning | backpropagate, Axolotl, Unsloth |
| `alpaca` | Instruction tuning | backpropagate, LLaMA-Factory |
| `sharegpt` | Multi-turn chat | ShareGPT-compatible trainers |
| `openai` | OpenAI-style fine-tuning | OpenAI API, backpropagate |
| `completion` | Continued pre-training | Any causal LM trainer |
| `fim` | Fill-in-the-middle | StarCoder, CodeLlama |
| `raw` | Custom pipelines | Direct JSONL consumption |

## Validate Quality

```bash
repo-dataset validate ./my-project-dataset/dataset.jsonl
```

The validator checks structural integrity, distribution balance, content quality, and contamination (secrets, PII, benchmark leaks). Output is a letter grade (A-F) with actionable feedback.

## Generate + Validate in One Step

```bash
repo-dataset generate ./my-project --format chatml --validate
```

## Train with Backpropagate

```bash
repo-dataset generate ./my-project --format chatml --pipe-to-backpropagate
backprop train --data ./my-project-dataset/dataset.jsonl --steps 300
```

Backpropagate auto-detects the format from field names. Use `chatml` for Mistral/Hermes models, `alpaca` for LLaMA, `openai` for GPT-style training.
