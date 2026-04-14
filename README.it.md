<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/repo-dataset/readme.png" width="400" alt="Repo Dataset">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/actions"><img src="https://github.com/mcp-tool-shop-org/repo-dataset/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/repo-dataset"><img src="https://img.shields.io/npm/v/@mcptoolshop/repo-dataset" alt="npm"></a>
</p>

Convertire qualsiasi repository Git o repository di stili visivi in set di dati per l'addestramento di modelli linguistici (LLM).

**Pipeline per il codice:** Estrae segnali di addestramento da codice, commit, documentazione e test. Produce file JSONL in 6 formati, pronti per il fine-tuning o il pre-addestramento.

**Pipeline visiva:** Estrae dati di addestramento multimodali da repository visivi curati. Valida le immagini, applica vincoli su asset, canoni e giudizi, e produce output in 10 formati nativi per il fine-tuning di modelli linguaggio-visione.

## Modello di sicurezza

repo-dataset legge i file sorgente e la cronologia di Git dai repository a cui la si indica. Scrive l'output in formato JSONL in una directory specificata. **Non** effettua richieste di rete, non raccoglie dati di telemetria e non accede a file al di fuori del repository di destinazione e della directory di output. Sono previste protezioni contro attacchi di attraversamento di percorsi e symlink. Consultare [SECURITY.md](SECURITY.md) per segnalare eventuali vulnerabilità.

## Installazione

```bash
npm install -g @mcptoolshop/repo-dataset
```

## Pipeline per il codice

```bash
# Generate training data from a code repo
repo-dataset generate ./my-project --format alpaca

# Preview extraction (dry run)
repo-dataset inspect ./my-project

# Quality report on generated data
repo-dataset validate ./dataset-output/dataset.jsonl

# Control signal balance
repo-dataset generate ./my-project --format completion --auto-balance
```

### Formati di output per il codice

| Formato | Caso d'uso |
|--------|----------|
| `alpaca` | Fine-tuning supervisionato (istruzione/input/output) |
| `sharegpt` | Fine-tuning di conversazioni a più turni |
| `openai` | Formato dei messaggi di OpenAI |
| `raw` | Pre-addestramento continuo / Inserimento per RAG (Retrieval-Augmented Generation) |
| `completion` | Codice grezzo come testo (modellazione del linguaggio) |
| `fim` | Completamento "fill-in-the-middle" (token di StarCoder) |

### Estrattori di codice

| Estrattore | Sorgente | Segnale di addestramento |
|-----------|--------|-----------------|
| `code` | File sorgente | Estrazione di funzioni/classi con contesto di importazione |
| `commits` | Cronologia di Git | Coppie di spiegazioni delle modifiche |
| `docs` | File Markdown | Spiegazioni concettuali basate su sezioni |
| `tests` | File di test | Coppie di generazione di codice-test |

## Pipeline visiva

```bash
# Generate training data from a visual style repo
repo-dataset visual generate ./my-style-repo --format trl

# With base64-embedded images (self-contained JSONL)
repo-dataset visual generate ./my-style-repo --format trl --embed

# Preview visual extraction
repo-dataset visual inspect ./my-style-repo

# Corpus health report
repo-dataset visual validate ./exports/dataset.jsonl
```

### Formati di output visivi

**Nativi del framework (consigliati):**

| Formato | Framework | Supporto DPO (Direct Preference Optimization) |
|--------|-----------|-------------|
| `trl` | HuggingFace TRL, Unsloth | Sì |
| `axolotl` | Axolotl | Sì |
| `llava` | LLaVA, LLaVA-NeXT | Solo SFT (Supervised Fine-Tuning) |
| `llama_factory` | LLaMA-Factory | Sì |
| `qwen2vl` | Qwen2-VL, MS-Swift | Sì |

**Generici:**

| Formato | Caso d'uso |
|--------|----------|
| `visual_universal` | Ispezione, debug, conversione |
| `visual_dpo` | Coppie di preferenze DPO |
| `visual_kto` | Etichette binarie KTO (Knowledge Transfer Optimization) |
| `visual_contrastive` | Coppie positive/negative in stile CLIP |
| `visual_pointwise` | Punteggi di qualità per singolo asset |

### Flag visivi

```bash
--embed              # Base64-encode images into JSONL
--allow-incomplete   # Keep units without full asset+canon+judgment triangle
--no-copy-images     # Skip copying images to output folder
--no-synthetic       # Skip synthetic pair generation
```

### Integrità dei vincoli

Ogni unità di addestramento visivo viene controllata per il **triangolo di addestramento**:

1. **Immagine** — file immagine valido (PNG/JPEG/WebP, dimensioni estratte, rilevamento di troncature)
2. **Canone** — spiegazione canonica basata su regole di stile
3. **Giudizio** — stato approvato/rifiutato con punteggi per dimensione

Le unità che non hanno tutti e tre gli elementi vengono automaticamente scartate. Utilizzare `--allow-incomplete` per mantenere le unità parziali.

## Integrazione di backpropagation

Gli output di repo-dataset sono compatibili con [backpropagate](https://github.com/mcp-tool-shop-org/backpropagate) per il fine-tuning locale.

### Formati consigliati

| Obiettivo | Formato | Perché |
|------|--------|-----|
| Fine-tuning del codice | `chatml` o `alpaca` | Coppie di istruzioni strutturate che si mappano direttamente a task di codice |
| Fine-tuning di conversazioni | `sharegpt` o `openai` | Struttura di conversazioni a più turni preservata |
| Completamento grezzo | `completion` | Testo non strutturato per il pre-addestramento continuo |

Backpropagate accetta: `alpaca`, `sharegpt`, `openai`, `chatml` e `completion`.

### Flusso di lavoro end-to-end

```bash
# Generate training data from your repo
repo-dataset generate ./my-project --format chatml --validate

# Fine-tune with backpropagate
backprop train --data ./my-project-dataset/dataset.jsonl --steps 300
```

### Set di dati visivi

Le uscite della pipeline visiva (TRL, Axolotl, LLaVA, ecc.) sono destinate all'affinamento dei modelli multimodali (visione e linguaggio). Backpropagate non supporta ancora l'addestramento di modelli multimodali; utilizzare direttamente i formati nativi del framework con i rispettivi trainer.

## Informazioni

- **Versione:** 1.1.0
- **Test:** 445
- **Dipendenze a runtime:** 0
- **Node:** 20+

## Licenza

MIT

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
