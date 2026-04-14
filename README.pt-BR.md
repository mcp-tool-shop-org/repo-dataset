<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/repo-dataset/readme.png" width="400" alt="Repo Dataset">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/actions"><img src="https://github.com/mcp-tool-shop-org/repo-dataset/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/repo-dataset"><img src="https://img.shields.io/npm/v/@mcptoolshop/repo-dataset" alt="npm"></a>
</p>

Converta qualquer repositório Git ou repositório de estilos visuais em conjuntos de dados de treinamento para LLMs (Large Language Models).

**Pipeline de código:** Extrai sinais de treinamento de código, commits, documentação e testes. Produz arquivos JSONL em 6 formatos, prontos para ajuste fino ou pré-treinamento.

**Pipeline visual:** Extrai dados de treinamento multimodais de repositórios visuais selecionados. Valida imagens, aplica regras de vinculação de ativos e avaliações, e produz arquivos em 10 formatos nativos de frameworks para ajuste fino de modelos de linguagem e visão.

## Modelo de Segurança

O `repo-dataset` lê arquivos de origem e histórico do Git dos repositórios que você especifica. Ele grava arquivos JSONL em um diretório que você define. Ele **não** faz solicitações de rede, coleta dados de telemetria ou acessa arquivos fora do repositório de destino e do diretório de saída. Ataques de percurso de diretório e links simbólicos são protegidos. Consulte [SECURITY.md](SECURITY.md) para relatar vulnerabilidades.

## Instalação

```bash
npm install -g @mcptoolshop/repo-dataset
```

## Pipeline de Código

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

### Formatos de Saída de Código

| Formato | Caso de Uso |
|--------|----------|
| `alpaca` | Ajuste fino supervisionado (instrução/entrada/saída) |
| `sharegpt` | Ajuste fino de conversas com várias etapas |
| `openai` | Formato de mensagens da OpenAI |
| `raw` | Pré-treinamento contínuo / Ingestão para RAG (Retrieval-Augmented Generation) |
| `completion` | Código bruto como texto (modelagem de linguagem) |
| `fim` | Preenchimento do meio (tokens StarCoder) |

### Extratores de Código

| Extrator | Fonte | Sinal de Treinamento |
|-----------|--------|-----------------|
| `code` | Arquivos de origem | Extração de funções/classes com contexto de importação |
| `commits` | Histórico do Git | Pares de explicação de alterações |
| `docs` | Arquivos Markdown | Explicações de conceitos baseadas em seções |
| `tests` | Arquivos de teste | Pares de geração de código para teste |

## Pipeline Visual

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

### Formatos de Saída Visuais

**Nativos do framework (recomendado):**

| Formato | Framework | Suporte DPO (Direct Preference Optimization) |
|--------|-----------|-------------|
| `trl` | HuggingFace TRL, Unsloth | Sim |
| `axolotl` | Axolotl | Sim |
| `llava` | LLaVA, LLaVA-NeXT | Apenas SFT (Supervised Fine-Tuning) |
| `llama_factory` | LLaMA-Factory | Sim |
| `qwen2vl` | Qwen2-VL, MS-Swift | Sim |

**Genéricos:**

| Formato | Caso de Uso |
|--------|----------|
| `visual_universal` | Inspeção, depuração, conversão |
| `visual_dpo` | Pares de preferências DPO |
| `visual_kto` | Rótulos binários KTO (Knowledge Transfer Optimization) |
| `visual_contrastive` | Pares positivos/negativos no estilo CLIP |
| `visual_pointwise` | Pontuações de qualidade por ativo |

### Flags Visuais

```bash
--embed              # Base64-encode images into JSONL
--allow-incomplete   # Keep units without full asset+canon+judgment triangle
--no-copy-images     # Skip copying images to output folder
--no-synthetic       # Skip synthetic pair generation
```

### Integridade da Vinculação

Cada unidade de treinamento visual é verificada quanto ao **triângulo de treinamento**:

1. **Imagem** — arquivo de imagem válido (PNG/JPEG/WebP, dimensões extraídas, detecção de truncamento)
2. **Canon** — explicação canônica baseada em regras de estilo
3. **Julgamento** — status aprovado/rejeitado com pontuações por dimensão

Unidades sem os três elementos são descartadas por padrão. Use `--allow-incomplete` para manter unidades parciais.

## Integração de Backpropagation

As saídas do `repo-dataset` são compatíveis com [backpropagate](https://github.com/mcp-tool-shop-org/backpropagate) para ajuste fino local.

### Formatos Recomendados

| Objetivo | Formato | Por que |
|------|--------|-----|
| Ajuste fino de código | `chatml` ou `alpaca` | Pares de instruções estruturados mapeiam diretamente para tarefas de código |
| Ajuste fino de conversas | `sharegpt` ou `openai` | Estrutura de conversas com várias etapas preservada |
| Preenchimento bruto | `completion` | Texto não estruturado para pré-treinamento contínuo |

O `backpropagate` aceita: `alpaca`, `sharegpt`, `openai`, `chatml` e `completion`.

### Fluxo de Trabalho de Ponta a Ponta

```bash
# Generate training data from your repo
repo-dataset generate ./my-project --format chatml --validate

# Fine-tune with backpropagate
backprop train --data ./my-project-dataset/dataset.jsonl --steps 300
```

### Conjuntos de dados visuais

As saídas visuais da pipeline (TRL, Axolotl, LLaVA, etc.) são voltadas para o ajuste fino de modelos de visão e linguagem. O Backpropagate ainda não suporta o treinamento de VLMs (Modelos de Visão e Linguagem) – utilize os formatos nativos da estrutura diretamente com seus respectivos treinadores.

## Estatísticas

- **Versão:** 1.1.0
- **Testes:** 445
- **Dependências de tempo de execução:** 0
- **Node:** 20+

## Licença

MIT

---

Criado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
