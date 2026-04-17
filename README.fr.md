<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/repo-dataset/readme.png" width="500" alt="Repo Dataset">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/actions"><img src="https://github.com/mcp-tool-shop-org/repo-dataset/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/repo-dataset"><img src="https://img.shields.io/npm/v/@mcptoolshop/repo-dataset" alt="npm"></a>
</p>

### Créez des ensembles de données d'entraînement à partir des dépôts avant de lancer l'entraînement

repo-dataset transforme le code, les commits, la documentation, les tests et les ressources visuelles sélectionnées en ensembles de données prêts pour l'entraînement, puis vérifie la qualité, l'intégrité des liens et les risques de contamination, afin que vous ne fassiez pas d'ajustements sur des données de mauvaise qualité.

repo-dataset est la couche de construction et de vérification des ensembles de données pour les flux de travail d'apprentissage automatique locaux. Ce n'est pas un outil d'entraînement. Ce n'est pas non plus une collection de formats.

## Ce que c'est / ce que ce n'est pas

- **Ce n'est pas un outil d'entraînement.** Il s'arrête au format JSONL. Utilisez-le avec [backpropagate](https://github.com/mcp-tool-shop-org/backpropagate), Axolotl, TRL, LLaMA-Factory, LLaVA ou Qwen2-VL.
- **Ce n'est pas un autre convertisseur de formats.** La prise en charge de nombreux formats est une exigence de base ; la couche supérieure, qui comprend les vérifications de contamination, l'évaluation de la qualité et l'intégrité des liens, est la valeur ajoutée.
- **C'est une couche de construction et de vérification des ensembles de données** pour les flux de travail d'apprentissage automatique locaux. Elle s'exécute avant l'entraînement et signale les éléments qui pourraient corrompre un processus d'ajustement.
- **C'est un complément, et non un concurrent, de [style-dataset-lab](https://github.com/mcp-tool-shop-org/style-dataset-lab).** style-dataset-lab est un système spécialisé pour les ensembles de données canoniques et visuels, destiné aux guides de style rédigés. repo-dataset est la couche de construction et de vérification plus large que tout dépôt, qu'il contienne du code ou des ressources visuelles, peut utiliser.

## À qui cela s'adresse

- Aux professionnels de l'apprentissage automatique qui entraînent de petits modèles sur leur propre code et qui souhaitent savoir si leur ensemble de données est réellement adapté à l'entraînement.
- Aux équipes qui créent des ensembles de données visuels privés pour l'ajustement de modèles de langage visuels (VLM) et qui ont besoin de garantir la cohérence des ressources, du canon et des annotations, plutôt que de simplement faire confiance aux données.
- Aux chercheurs qui ont besoin d'audits de contamination (informations confidentielles divulguées, données personnelles, signatures de références) avant de publier un ensemble de données ou un article.

## Installation

```bash
npm install -g @mcptoolshop/repo-dataset
```

## La vérification de la contamination

C'est la raison d'être de cet outil. Une fois que vous avez généré un ensemble de données, la commande `validate` vous indique si celui-ci est sûr pour être utilisé pour l'entraînement.

```bash
repo-dataset validate ./dataset-output/dataset.jsonl
```

La structure de la sortie est la suivante (la forme ne fait que décrire la structure ; les nombres réels dépendent de votre corpus) :

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

La note indique le résultat. Un enregistrement qui contient un secret, des données personnelles ou une signature de référence est signalé pour chaque enregistrement, afin que vous puissiez le supprimer, le masquer ou régénérer la portion qui l'a produit, avant que l'outil d'entraînement ne voie le fichier.

## Pipeline de code

```bash
# Generate training data from a code repo
repo-dataset generate ./my-project --format alpaca

# Preview extraction (dry run)
repo-dataset inspect ./my-project

# Control signal balance across extractors
repo-dataset generate ./my-project --format completion --auto-balance
```

### Formats de sortie

| Format | Cas d'utilisation |
|--------|----------|
| `alpaca` | Ajustement supervisé (instruction/entrée/sortie) |
| `sharegpt` | Ajustement pour conversations en plusieurs tours |
| `openai` | Format de messages OpenAI |
| `chatml` | Jetons de rôle ChatML (Mistral, Hermes, OpenHermes) |
| `raw` | Pré-entraînement continu / ingestion pour la recherche d'informations (RAG) |
| `completion` | Code brut sous forme de texte (modélisation du langage) |
| `fim` | Remplissage du milieu (tokens StarCoder) |

### Extracteurs

| Extracteur | Source | Signal d'entraînement |
|-----------|--------|-----------------|
| `code` | Fichiers sources | Extraction de fonctions/classes avec contexte d'importation |
| `commits` | Historique Git | Paires d'explications de modifications |
| `docs` | Fichiers Markdown | Explications de concepts basées sur des sections |
| `tests` | Fichiers de tests | Paires de génération de tests à partir du code |
| `config` | Fichiers structurés | Dockerfile, tsconfig, Cargo.toml, workflows CI, etc. |

## Pipeline visuel

Le pipeline visuel n'est pas qu'une simple enveloppe autour du pipeline de code. Il impose le **triangle d'entraînement** — image + canon + annotation — car cette cohérence est ce qui distingue un ensemble de données VLM utilisable d'un simple ensemble d'images étiquetées.

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

### Intégrité des liens (le triangle)

Chaque unité d'entraînement visuelle est vérifiée pour trois éléments :

1. **Image** — fichier image valide (PNG/JPEG/WebP, dimensions extraites, troncature détectée).
2. **Canonique** — explication conforme aux règles de style.
3. **Jugement** — statut approuvé/refusé avec des scores par dimension.

Par défaut, les éléments incomplets (manquant une partie) sont supprimés. L'option `--allow-incomplete` conserve les éléments partiels lorsque vous savez pourquoi vous en avez besoin.

### Formats de sortie

**Intégré au framework (recommandé) :**

| Format | Framework | Prise en charge de DPO |
|--------|-----------|-------------|
| `trl` | HuggingFace TRL, Unsloth | Oui |
| `axolotl` | Axolotl | Oui |
| `llava` | LLaVA, LLaVA-NeXT | SFT uniquement |
| `llama_factory` | LLaMA-Factory | Oui |
| `qwen2vl` | Qwen2-VL, MS-Swift | Oui |

**Générique :**

| Format | Cas d'utilisation |
|--------|----------|
| `visual_universal` | Inspection, débogage, conversion |
| `visual_dpo` | Paires de préférences DPO |
| `visual_kto` | Étiquettes binaires KTO |
| `visual_contrastive` | Paires positives/négatives de type CLIP |
| `visual_pointwise` | Scores de qualité par élément |

### Indicateurs

```bash
--embed              # Base64-encode images into JSONL
--allow-incomplete   # Keep units without full asset+canon+judgment triangle
--no-copy-images     # Skip copying images to output folder
--no-synthetic       # Skip synthetic pair generation
```

## Intégration de rétropropagation

Les sorties de repo-dataset sont envoyées à [backpropagate](https://github.com/mcp-tool-shop-org/backpropagate) pour un ajustement fin local sans étape de conversion de format.

| Objectif | Format | Pourquoi |
|------|--------|-----|
| Ajustement fin du code | `chatml` ou `alpaca` | Les paires d'instructions structurées sont directement associées aux tâches de code. |
| Ajustement fin pour le chat | `sharegpt` ou `openai` | Structure de conversation multi-tours préservée. |
| Complétion brute | `completion` | Texte non structuré pour un pré-entraînement continu. |

Backpropagate accepte : `alpaca`, `sharegpt`, `openai`, `chatml`, `completion`.

```bash
# Generate, validate, then fine-tune
repo-dataset generate ./my-project --format chatml --validate
backprop train --data ./my-project-dataset/dataset.jsonl --steps 300
```

Les sorties de la pipeline visuelle (TRL, Axolotl, LLaVA, etc.) sont destinées à l'ajustement fin des modèles vision-langage. Backpropagate ne prend pas encore en charge la formation de modèles vision-langage ; utilisez les formats intégrés au framework avec leurs entraîneurs respectifs.

## Modèle de sécurité

repo-dataset lit les fichiers sources et l'historique Git des dépôts auxquels vous le pointez, et écrit des fichiers JSONL dans un répertoire que vous spécifiez. Il ne fait **pas** de requêtes réseau, ne collecte pas de données télémétriques et n'accède pas aux fichiers en dehors du dépôt cible et du répertoire de sortie. Les attaques par parcours de chemin et les attaques par liens symboliques sont protégées. Consultez [SECURITY.md](SECURITY.md) pour signaler les vulnérabilités. Les tests de sécurité (shipcheck) passent tous (voir [SHIP_GATE.md](SHIP_GATE.md) et [SCORECARD.md](SCORECARD.md)).

## Relevés

Ensembles de données réels provenant de dépôts réels, accompagnés de résultats M5 Max (prévu pour avril 2026). Cette section sera complétée par des informations sur la détection de contamination, les notes de qualité et les courbes d'ajustement fin de bout en bout provenant de tests internes sur notre propre code et nos corpus visuels.

En attendant, la preuve se trouve dans la suite de tests et la forme de sortie du validateur mentionnée ci-dessus, et non dans les affirmations marketing.

## Statistiques

- **Version :** 1.2.0
- **Tests :** 460 réussis sur 91 suites
- **Dépendances d'exécution :** 0
- **Node :** 20+
- **Package :** 83 fichiers / 245 kB

## Licence

MIT

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
