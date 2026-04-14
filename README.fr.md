<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/repo-dataset/readme.png" width="400" alt="Repo Dataset">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/actions"><img src="https://github.com/mcp-tool-shop-org/repo-dataset/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/repo-dataset"><img src="https://img.shields.io/npm/v/@mcptoolshop/repo-dataset" alt="npm"></a>
</p>

Convertir n'importe quel dépôt Git ou dépôt de styles visuels en ensembles de données pour l'entraînement de modèles de langage (LLM).

**Pipeline de code :** Extrait les signaux d'entraînement du code, des commits, de la documentation et des tests. Génère des fichiers JSONL dans 6 formats, prêts pour le fine-tuning ou le pré-entraînement.

**Pipeline visuel :** Extrait des données d'entraînement multimodales à partir de dépôts visuels sélectionnés. Valide les images, applique des règles de cohérence (asset+canon+judgment), et génère des fichiers dans 10 formats natifs pour le fine-tuning de modèles de langage et de vision.

## Modèle de sécurité

repo-dataset lit les fichiers sources et l'historique Git des dépôts que vous lui spécifiez. Il écrit la sortie au format JSONL dans un répertoire que vous définissez. Il **ne** fait **pas** de requêtes réseau, ne collecte pas de données télémétriques et n'accède pas aux fichiers situés en dehors du dépôt cible et du répertoire de sortie. Les attaques par parcours de chemin et les attaques par liens symboliques sont protégées. Consultez le fichier [SECURITY.md](SECURITY.md) pour signaler les vulnérabilités.

## Installation

```bash
npm install -g @mcptoolshop/repo-dataset
```

## Pipeline de code

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

### Formats de sortie du code

| Format | Cas d'utilisation |
|--------|----------|
| `alpaca` | Fine-tuning supervisé (instruction/entrée/sortie) |
| `sharegpt` | Fine-tuning de conversations multi-tours |
| `openai` | Format des messages OpenAI |
| `raw` | Pré-entraînement continu / Intégration RAG |
| `completion` | Code brut sous forme de texte (modélisation du langage) |
| `fim` | Remplissage du milieu (tokens StarCoder) |

### Extracteurs de code

| Extracteur | Source | Signal d'entraînement |
|-----------|--------|-----------------|
| `code` | Fichiers sources | Extraction de fonctions/classes avec contexte d'importation |
| `commits` | Historique Git | Paires d'explications de modifications |
| `docs` | Fichiers Markdown | Explications de concepts basées sur des sections |
| `tests` | Fichiers de tests | Paires de génération de code à partir de tests |

## Pipeline visuel

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

### Formats de sortie visuels

**Formats natifs du framework (recommandés) :**

| Format | Framework | Prise en charge de DPO |
|--------|-----------|-------------|
| `trl` | HuggingFace TRL, Unsloth | Oui |
| `axolotl` | Axolotl | Oui |
| `llava` | LLaVA, LLaVA-NeXT | Fine-tuning uniquement |
| `llama_factory` | LLaMA-Factory | Oui |
| `qwen2vl` | Qwen2-VL, MS-Swift | Oui |

**Génériques :**

| Format | Cas d'utilisation |
|--------|----------|
| `visual_universal` | Inspection, débogage, conversion |
| `visual_dpo` | Paires de préférences DPO |
| `visual_kto` | Étiquettes binaires KTO |
| `visual_contrastive` | Paires positives/négatives de type CLIP |
| `visual_pointwise` | Scores de qualité par ressource |

### Indicateurs visuels

```bash
--embed              # Base64-encode images into JSONL
--allow-incomplete   # Keep units without full asset+canon+judgment triangle
--no-copy-images     # Skip copying images to output folder
--no-synthetic       # Skip synthetic pair generation
```

### Intégrité des liaisons

Chaque unité d'entraînement visuelle est vérifiée pour le **triangle d'entraînement** :

1. **Image** — fichier image valide (PNG/JPEG/WebP, dimensions extraites, détection de troncature)
2. **Canon** — explication canonique basée sur les règles de style
3. **Jugement** — statut approuvé/refusé avec des scores par dimension

Les unités qui ne possèdent pas les trois éléments sont automatiquement supprimées. Utilisez `--allow-incomplete` pour conserver les unités partielles.

## Intégration de rétropropagation

Les sorties de repo-dataset sont compatibles avec [backpropagate](https://github.com/mcp-tool-shop-org/backpropagate) pour le fine-tuning local.

### Formats recommandés

| Objectif | Format | Pourquoi |
|------|--------|-----|
| Fine-tuning du code | `chatml` ou `alpaca` | Les paires d'instructions structurées se mappent directement aux tâches de code |
| Fine-tuning de conversations | `sharegpt` ou `openai` | Structure de conversation multi-tours préservée |
| Complétion brute | `completion` | Texte non structuré pour le pré-entraînement continu |

Backpropagate accepte : `alpaca`, `sharegpt`, `openai`, `chatml` et `completion`.

### Flux de travail de bout en bout

```bash
# Generate training data from your repo
repo-dataset generate ./my-project --format chatml --validate

# Fine-tune with backpropagate
backprop train --data ./my-project-dataset/dataset.jsonl --steps 300
```

### Ensembles de données visuels

Les sorties du pipeline visuel (TRL, Axolotl, LLaVA, etc.) sont destinées au réglage fin des modèles vision-langage. Backpropagate ne prend pas encore en charge la formation des modèles vision-langage ; utilisez directement les formats natifs du framework avec leurs formateurs respectifs.

## Statistiques

- **Version :** 1.1.0
- **Tests :** 445
- **Dépendances d'exécution :** 0
- **Node :** 20+

## Licence

MIT

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
