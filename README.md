# @mcptoolshop/repo-dataset

Convert any git repository into LLM training datasets.

Extracts training signals from code, commits, documentation, and tests — outputs JSONL in formats ready for fine-tuning (Alpaca, ShareGPT, OpenAI) or continued pre-training (raw text chunks).

## Install

```bash
npm install -g @mcptoolshop/repo-dataset
```

## Usage

```bash
# Generate training data from a local repo
repo-dataset generate ./my-project --format alpaca

# Preview what would be extracted
repo-dataset inspect ./my-project

# Show supported languages and extractors
repo-dataset info
```

## Output Formats

| Format | Use Case |
|--------|----------|
| `alpaca` | Supervised fine-tuning (instruction/input/output) |
| `sharegpt` | Multi-turn conversation fine-tuning |
| `openai` | OpenAI messages format |
| `raw` | Continued pre-training / RAG ingestion |

## Extractors

| Extractor | Source | Training Signal |
|-----------|--------|-----------------|
| `code` | Source files | Function explanations, docstring pairs |
| `commits` | Git history | Change explanations, implementation pairs |
| `docs` | Markdown files | Concept explanations |
| `tests` | Test files | Code-to-test generation pairs |

## Backpropagate Integration

Pipe output directly into fine-tuning:

```bash
repo-dataset generate ./my-project --pipe-to-backpropagate
# Outputs: backprop train --data ./dataset-output/dataset.jsonl --steps 100
```

## License

MIT
