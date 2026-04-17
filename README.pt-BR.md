<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/repo-dataset/readme.png" width="500" alt="Repo Dataset">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/actions"><img src="https://github.com/mcp-tool-shop-org/repo-dataset/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/repo-dataset"><img src="https://img.shields.io/npm/v/@mcptoolshop/repo-dataset" alt="npm"></a>
</p>

### Crie conjuntos de dados de treinamento a partir de repositórios antes de usar um sistema de treinamento

O `repo-dataset` transforma código, commits, documentação, testes e recursos visuais selecionados em conjuntos de dados prontos para treinamento, e, em seguida, verifica a qualidade, a integridade das associações e o risco de contaminação, para que você não ajuste um modelo com dados de baixa qualidade.

O `repo-dataset` é a camada de construção e verificação de conjuntos de dados para fluxos de trabalho de aprendizado de máquina locais. Não é um sistema de treinamento. Não é uma coleção de formatos.

## O que é / o que não é

- **Não é um sistema de treinamento.** Ele para na fase JSONL. Use-o em conjunto com [backpropagate](https://github.com/mcp-tool-shop-org/backpropagate), Axolotl, TRL, LLaMA-Factory, LLaVA ou Qwen2-VL.
- **Não é outro conversor de formatos.** A variedade de formatos é fundamental; a camada superior, que inclui verificações de contaminação, classificação de qualidade e integridade das associações, é o que realmente importa.
- **É uma camada de construção e verificação de conjuntos de dados** para fluxos de trabalho de aprendizado de máquina locais. Ele é executado antes do treinamento e identifica o que poderia corromper um processo de ajuste fino.
- **É um complemento, não um concorrente, do [style-dataset-lab](https://github.com/mcp-tool-shop-org/style-dataset-lab).** O `style-dataset-lab` é um sistema especializado para conjuntos de dados visuais e "bíblia de estilo" para conteúdo escrito; o `repo-dataset` é a camada mais ampla de construção e verificação que qualquer repositório, seja de código ou visual, pode utilizar.

## Para quem é isso

- Profissionais de aprendizado de máquina que treinam modelos pequenos com seu próprio código e querem saber se o conjunto de dados é adequado para treinamento.
- Equipes que curam conjuntos de dados visuais privados para ajuste fino de modelos de linguagem visuais e precisam garantir a integridade dos recursos, a referência e a avaliação.
- Pesquisadores que precisam de auditorias de contaminação (segredos vazados, informações de identificação pessoal, assinaturas de benchmarks) antes de publicar um conjunto de dados ou um artigo.

## Instalação

```bash
npm install -g @mcptoolshop/repo-dataset
```

## A verificação de contaminação

A razão pela qual isso existe. Depois de gerar um conjunto de dados, a função `validate` informa se é seguro usá-lo para treinar um modelo.

```bash
repo-dataset validate ./dataset-output/dataset.jsonl
```

A estrutura da saída é a seguinte (os valores reais dependem do seu conjunto de dados):

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

A classificação é o resultado. Um registro que contém um segredo, informações de identificação pessoal ou uma assinatura de benchmark é sinalizado para cada registro, para que você possa removê-lo, anonimizá-lo ou regenerar a parte que o gerou, antes que o sistema de treinamento acesse o arquivo.

## Pipeline de código

```bash
# Generate training data from a code repo
repo-dataset generate ./my-project --format alpaca

# Preview extraction (dry run)
repo-dataset inspect ./my-project

# Control signal balance across extractors
repo-dataset generate ./my-project --format completion --auto-balance
```

### Formatos de saída

| Formato | Caso de uso |
|--------|----------|
| `alpaca` | Ajuste fino supervisionado (instrução/entrada/saída) |
| `sharegpt` | Ajuste fino de conversas com várias etapas |
| `openai` | Formato de mensagens da OpenAI |
| `chatml` | Tokens de função do ChatML (Mistral, Hermes, OpenHermes) |
| `raw` | Pré-treinamento contínuo / ingestão para recuperação aumentada por geração (RAG) |
| `completion` | Código bruto como texto (modelagem de linguagem) |
| `fim` | Preenchimento de lacunas (tokens do StarCoder) |

### Extratores

| Extrator | Fonte | Sinal de treinamento |
|-----------|--------|-----------------|
| `code` | Arquivos de origem | Extração de funções/classes com contexto de importação |
| `commits` | Histórico do Git | Pares de explicação de alterações |
| `docs` | Arquivos Markdown | Explicações de conceitos baseadas em seções |
| `tests` | Arquivos de teste | Pares de geração de código para teste |
| `config` | Arquivos estruturados | Dockerfile, tsconfig, Cargo.toml, fluxos de trabalho de CI, etc. |

## Pipeline visual

O pipeline visual não é apenas uma camada superficial sobre o pipeline de código. Ele impõe o **triângulo de treinamento** — imagem + referência + avaliação — porque essa associação é o que diferencia um conjunto de dados de linguagem visual utilizável de uma coleção de imagens rotuladas.

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

### Integridade das associações (o triângulo)

Cada unidade de treinamento visual é verificada em três aspectos:

1. **Imagem** — arquivo de imagem válido (PNG/JPEG/WebP, dimensões extraídas, detecção de truncamento).
2. **Canônico** — explicação canônica baseada em regras de estilo.
3. **Julgamento** — status de aprovação/rejeição com pontuações por dimensão.

Unidades que não possuem nenhuma perna são descartadas por padrão. A opção `--allow-incomplete` mantém as unidades parciais quando você sabe por que deseja mantê-las.

### Formatos de saída

**Nativo do framework (recomendado):**

| Formato | Framework | Suporte a DPO |
|--------|-----------|-------------|
| `trl` | HuggingFace TRL, Unsloth | Sim |
| `axolotl` | Axolotl | Sim |
| `llava` | LLaVA, LLaVA-NeXT | Apenas SFT |
| `llama_factory` | LLaMA-Factory | Sim |
| `qwen2vl` | Qwen2-VL, MS-Swift | Sim |

**Genérico:**

| Formato | Caso de uso |
|--------|----------|
| `visual_universal` | Inspeção, depuração, conversão |
| `visual_dpo` | Pares de preferências DPO |
| `visual_kto` | Rótulos binários KTO |
| `visual_contrastive` | Pares positivos/negativos no estilo CLIP |
| `visual_pointwise` | Pontuações de qualidade por ativo |

### Flags (marcadores)

```bash
--embed              # Base64-encode images into JSONL
--allow-incomplete   # Keep units without full asset+canon+judgment triangle
--no-copy-images     # Skip copying images to output folder
--no-synthetic       # Skip synthetic pair generation
```

## Integração de retropropagação

As saídas do repo-dataset são direcionadas para [backpropagate](https://github.com/mcp-tool-shop-org/backpropagate) para ajuste fino local, sem a necessidade de uma etapa de conversão de formato.

| Objetivo | Formato | Por quê |
|------|--------|-----|
| Ajuste fino de código | `chatml` ou `alpaca` | Pares de instruções estruturadas mapeados diretamente para tarefas de código |
| Ajuste fino de conversas | `sharegpt` ou `openai` | Estrutura de conversas com várias etapas preservada |
| Conclusão bruta | `completion` | Texto não estruturado para pré-treinamento contínuo |

Backpropagate aceita: `alpaca`, `sharegpt`, `openai`, `chatml`, `completion`.

```bash
# Generate, validate, then fine-tune
repo-dataset generate ./my-project --format chatml --validate
backprop train --data ./my-project-dataset/dataset.jsonl --steps 300
```

As saídas do pipeline visual (TRL, Axolotl, LLaVA, etc.) são direcionadas para o ajuste fino de modelos visão-linguagem. Backpropagate ainda não suporta o treinamento de VLMs (modelos de linguagem visual) — use os formatos nativos do framework com seus respectivos treinadores.

## Modelo de segurança

repo-dataset lê arquivos de origem e histórico do Git dos repositórios que você especifica, e escreve JSONL em um diretório que você define. Ele **não** faz solicitações de rede, coleta telemetria ou acessa arquivos fora do repositório de origem e do diretório de saída. Ataques de percurso de diretório e symlink são protegidos. Consulte [SECURITY.md](SECURITY.md) para relatar vulnerabilidades. Os testes de segurança (shipcheck) passam em todas as etapas (A–D) (veja [SHIP_GATE.md](SHIP_GATE.md) e [SCORECARD.md](SCORECARD.md)).

## Receitas

Conjuntos de dados reais de repositórios reais, com resultados do M5 Max (aproximadamente 24 de abril de 2026). Esta seção será preenchida com detecções de contaminação, classificações de qualidade e curvas de ajuste fino de ponta a ponta de testes internos em nosso próprio código e corpora visuais.

Enquanto isso, a prova está no conjunto de testes e na forma de saída do validador acima — não em alegações de marketing.

## Estatísticas

- **Versão:** 1.2.0
- **Testes:** 460 aprovados em 91 conjuntos
- **Dependências de tempo de execução:** 0
- **Node:** 20+
- **Pacote:** 83 arquivos / 245 kB

## Licença

MIT

---

Criado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a
