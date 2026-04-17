<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/repo-dataset/readme.png" width="500" alt="Repo Dataset">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/actions"><img src="https://github.com/mcp-tool-shop-org/repo-dataset/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/repo-dataset"><img src="https://img.shields.io/npm/v/@mcptoolshop/repo-dataset" alt="npm"></a>
</p>

### Costruisci i dati di addestramento dai repository prima di utilizzare il trainer

repo-dataset trasforma codice, commit, documentazione, test e risorse visive curate in set di dati pronti per l'addestramento, quindi verifica la qualità, l'integrità delle associazioni e il rischio di contaminazione, in modo da evitare di utilizzare dati di scarsa qualità per l'affinamento.

repo-dataset è lo strato di costruzione e verifica dei set di dati per i flussi di lavoro di machine learning locali. Non è un trainer. Non è una raccolta di formati.

## Cosa è / cosa non è

- **Non è un trainer.** Si ferma al formato JSONL. Utilizzalo in combinazione con [backpropagate](https://github.com/mcp-tool-shop-org/backpropagate), Axolotl, TRL, LLaMA-Factory, LLaVA o Qwen2-VL.
- **Non è un altro convertitore di formati.** La compatibilità con diversi formati è fondamentale; ciò che lo distingue è lo strato superiore: controlli di contaminazione, valutazione della qualità, integrità delle associazioni.
- **È uno strato di costruzione e verifica dei set di dati** per i flussi di lavoro di machine learning locali. Viene eseguito prima dell'addestramento e segnala ciò che potrebbe compromettere un processo di affinamento.
- **È un complemento, non un concorrente di [style-dataset-lab](https://github.com/mcp-tool-shop-org/style-dataset-lab).** style-dataset-lab è il sistema specializzato per set di dati visivi e "bibbie" di stile, mentre repo-dataset è lo strato più ampio di costruzione e verifica che può essere utilizzato con qualsiasi repository, sia di codice che visivo.

## A chi è rivolto

- Professionisti del machine learning che addestrano modelli di piccole dimensioni sul proprio codice e vogliono sapere se il loro set di dati è effettivamente adatto all'addestramento.
- Team che curano set di dati visivi privati per l'affinamento di modelli VLM e che necessitano di un sistema che imponga l'associazione tra risorse, "bibbie" e valutazioni, anziché affidarsi alla fiducia.
- Ricercatori che devono eseguire controlli di contaminazione (segreti trapelati, informazioni personali, firme di benchmark) prima di pubblicare un set di dati o un articolo.

## Installazione

```bash
npm install -g @mcptoolshop/repo-dataset
```

## Il controllo di contaminazione

Questo strumento esiste per questo motivo. Dopo aver generato un set di dati, il comando `validate` indica se è sicuro utilizzarlo per addestrare un modello.

```bash
repo-dataset validate ./dataset-output/dataset.jsonl
```

L'output ha questa struttura (le dimensioni sono indicative; i numeri effettivi dipendono dal corpus utilizzato):

```
Dataset Quality Report
  Records:          <count>
  Duplicate rate:   <percent>   (MinHash LSH, 64 hashes / 8 bands / 0.8 threshold)
  Token budget:     <p50 / p95 / max>

Contamination
  Leaked secrets:   <count>     (API keys, tokens, private key headers)
  PII patterns:     <count>     (emails, phone numbers, SSN-shaped strings)
  Benchmark leaks:  <count>     (HumanEval signature matches)

Grade: <A | B | C | D | F>
```

Il "grado" è il verdetto. Ogni record che contiene un segreto, informazioni personali o una firma di benchmark viene segnalato individualmente, in modo da poterlo eliminare, censurare o rigenerare la parte che lo ha prodotto, prima che il trainer acceda al file.

## Pipeline del codice

```bash
# Generate training data from a code repo
repo-dataset generate ./my-project --format alpaca

# Preview extraction (dry run)
repo-dataset inspect ./my-project

# Control signal balance across extractors
repo-dataset generate ./my-project --format completion --auto-balance
```

### Formati di output

| Formato | Caso d'uso |
|--------|----------|
| `alpaca` | Affinamento supervisionato (istruzione/input/output) |
| `sharegpt` | Affinamento di conversazioni a più turni |
| `openai` | Formato dei messaggi di OpenAI |
| `chatml` | Token di ruolo ChatML (Mistral, Hermes, OpenHermes) |
| `raw` | Pre-addestramento continuo / Inserimento per RAG |
| `completion` | Codice grezzo come testo (modellazione del linguaggio) |
| `fim` | Riempimento (token StarCoder) |

### Estrattori

| Estrattore | Origine | Segnale di addestramento |
|-----------|--------|-----------------|
| `code` | File sorgente | Estrazione di funzioni/classi con contesto di importazione |
| `commits` | Cronologia di Git | Coppie di spiegazioni delle modifiche |
| `docs` | File Markdown | Spiegazioni concettuali basate su sezioni |
| `tests` | File di test | Coppie di generazione di codice-test |
| `config` | File strutturati | Dockerfile, tsconfig, Cargo.toml, workflow CI, ecc. |

## Pipeline visiva

La pipeline visiva non è semplicemente un wrapper attorno alla pipeline del codice. Impone il **triangolo di addestramento** (immagine + "bibbia" + valutazione), perché questa associazione è ciò che distingue un set di dati VLM utilizzabile da una raccolta di immagini etichettate.

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

### Integrità delle associazioni (il triangolo)

Ogni unità di addestramento visivo viene controllata per tre aspetti:

1. **Immagine** — file immagine valido (PNG/JPEG/WebP, dimensioni estratte, rilevata troncamento).
2. **Canonico** — spiegazione canonica basata su regole di stile.
3. **Valutazione** — stato approvato/rifiutato con punteggi per dimensione.

Le unità che mancano di una qualsiasi parte vengono eliminate per impostazione predefinita. L'opzione `--allow-incomplete` mantiene le parti incomplete quando si sa perché si desidera conservarle.

### Formati di output

**Nativo del framework (consigliato):**

| Formato | Framework | Supporto DPO |
|--------|-----------|-------------|
| `trl` | HuggingFace TRL, Unsloth | Sì |
| `axolotl` | Axolotl | Sì |
| `llava` | LLaVA, LLaVA-NeXT | Solo SFT |
| `llama_factory` | LLaMA-Factory | Sì |
| `qwen2vl` | Qwen2-VL, MS-Swift | Sì |

**Generico:**

| Formato | Caso d'uso |
|--------|----------|
| `visual_universal` | Ispezione, debug, conversione |
| `visual_dpo` | Coppie di preferenze DPO |
| `visual_kto` | Etichette binarie KTO |
| `visual_contrastive` | Coppie positive/negative in stile CLIP |
| `visual_pointwise` | Punteggi di qualità per risorsa |

### Flag

```bash
--embed              # Base64-encode images into JSONL
--allow-incomplete   # Keep units without full asset+canon+judgment triangle
--no-copy-images     # Skip copying images to output folder
--no-synthetic       # Skip synthetic pair generation
```

## Integrazione di backpropagation

Gli output di repo-dataset vengono inviati a [backpropagate](https://github.com/mcp-tool-shop-org/backpropagate) per il fine-tuning locale senza una fase di conversione del formato.

| Obiettivo | Formato | Perché |
|------|--------|-----|
| Fine-tuning del codice | `chatml` o `alpaca` | Coppie di istruzioni strutturate mappate direttamente a task di codice |
| Fine-tuning di conversazioni | `sharegpt` o `openai` | Struttura della conversazione multi-turno preservata |
| Completamento grezzo | `completion` | Testo non strutturato per il pre-training continuo |

Backpropagate accetta: `alpaca`, `sharegpt`, `openai`, `chatml`, `completion`.

```bash
# Generate, validate, then fine-tune
repo-dataset generate ./my-project --format chatml --validate
backprop train --data ./my-project-dataset/dataset.jsonl --steps 300
```

Gli output della pipeline visiva (TRL, Axolotl, LLaVA, ecc.) sono destinati al fine-tuning di modelli vision-language. Backpropagate non supporta ancora l'addestramento di VLM; utilizzare i formati nativi del framework con i rispettivi trainer.

## Modello di sicurezza

repo-dataset legge i file sorgente e la cronologia di Git dai repository a cui si fa riferimento e scrive file JSONL in una directory specificata. **Non** effettua richieste di rete, raccoglie dati di telemetria o accede a file al di fuori del repository di destinazione e della directory di output. Sono previste protezioni contro attacchi di attraversamento di percorsi e symlink. Consultare [SECURITY.md](SECURITY.md) per segnalare eventuali vulnerabilità. I test di sicurezza hard passano tutti (vedere [SHIP_GATE.md](SHIP_GATE.md) e [SCORECARD.md](SCORECARD.md)).

## Ricevute

Set di dati reali provenienti da repository reali, con esecuzioni M5 Max (previste per il ~24 aprile 2026). Questa sezione verrà aggiornata con rilevamenti di contaminazione, valutazioni di qualità e curve di fine-tuning end-to-end provenienti da test interni sul nostro codice e sui nostri corpora visivi.

Nel frattempo, la prova è contenuta nella suite di test e nella forma di output del validatore indicata sopra, e non nelle dichiarazioni di marketing.

## Statistiche

- **Versione:** 1.2.0
- **Test:** 460 superati su 91 suite
- **Dipendenze runtime:** 0
- **Node:** 20+
- **Pacchetto:** 83 file / 245 kB

## Licenza

MIT

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a
