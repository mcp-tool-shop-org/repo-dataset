<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/repo-dataset/readme.png" width="500" alt="Repo Dataset">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/actions"><img src="https://github.com/mcp-tool-shop-org/repo-dataset/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/repo-dataset"><img src="https://img.shields.io/npm/v/@mcptoolshop/repo-dataset" alt="npm"></a>
</p>

### 在开始训练之前，先从代码仓库中构建训练数据集

`repo-dataset` 将代码、提交记录、文档、测试用例以及精心整理的视觉资源转换为可用于训练的数据集，然后检查数据的质量、完整性和潜在的污染风险，以确保您不会在不合格的数据上进行微调。

`repo-dataset` 是用于本地机器学习工作流程的数据集构建和验证层，而不是训练器或格式转换工具。

## 它是什么/它不是什么

- **不是训练器。** 它只生成 JSONL 格式的数据。请将其与 [backpropagate](https://github.com/mcp-tool-shop-org/backpropagate)、Axolotl、TRL、LLaMA-Factory、LLaVA 或 Qwen2-VL 等工具配合使用。
- **不是另一个格式转换器。** 格式的兼容性是基本要求；更重要的是，它提供的价值在于数据污染检查、质量评估和完整性验证。
- **是用于本地机器学习工作流程的数据集构建和验证层。** 它在训练之前运行，并会标记可能导致微调失败的数据。
- **是 [style-dataset-lab](https://github.com/mcp-tool-shop-org/style-dataset-lab) 的补充，而不是竞争对手。** `style-dataset-lab` 是一个专门用于创建带有视觉数据的风格指南系统；而 `repo-dataset` 是一个更广泛的数据集构建和验证层，任何代码或视觉资源都可以通过它进行处理。

## 适用于以下人群

- 独立机器学习从业者，他们希望在自己的代码上训练小型模型，并想知道数据集是否适合训练。
- 团队正在创建用于 VLM 微调的私有视觉数据集，他们需要确保资产、规范和判断的绑定，而不是仅仅依赖于信任。
- 研究人员需要在发布数据集或论文之前进行数据污染审计（例如，泄露的敏感信息、个人身份信息、基准测试签名）。

## 安装

```bash
npm install -g @mcptoolshop/repo-dataset
```

## 数据污染检查

这是存在的理由。 在生成数据集后，`validate` 命令会告诉您数据集是否安全，可以用于训练。

```bash
repo-dataset validate ./dataset-output/dataset.jsonl
```

输出格式如下（形状仅供参考，实际数值取决于您的数据集）：

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

评估结果是最终结论。 如果某个记录包含敏感信息、个人身份信息或基准测试签名，则会逐个记录进行标记，以便您可以将其删除、脱敏或重新生成包含该记录的部分，然后再将数据提供给训练器。

## 代码流水线

```bash
# Generate training data from a code repo
repo-dataset generate ./my-project --format alpaca

# Preview extraction (dry run)
repo-dataset inspect ./my-project

# Control signal balance across extractors
repo-dataset generate ./my-project --format completion --auto-balance
```

### 输出格式

| 格式 | 使用场景 |
|--------|----------|
| `alpaca` | 监督微调（指令/输入/输出） |
| `sharegpt` | 多轮对话微调 |
| `openai` | OpenAI 消息格式 |
| `chatml` | ChatML 角色令牌（Mistral、Hermes、OpenHermes） |
| `raw` | 持续预训练/RAG 数据导入 |
| `completion` | 将代码作为文本进行语言建模 |
| `fim` | 填空（StarCoder 令牌） |

### 提取器

| 提取器 | 数据源 | 训练信号 |
|-----------|--------|-----------------|
| `code` | 源文件 | 带有导入上下文的函数/类提取 |
| `commits` | Git 历史记录 | 代码变更解释对 |
| `docs` | Markdown 文件 | 基于章节的概念解释 |
| `tests` | 测试文件 | 代码到测试的生成对 |
| `config` | 结构化文件 | Dockerfile、tsconfig、Cargo.toml、CI 工作流程等。 |

## 视觉流水线

视觉流水线不是对代码流水线的简单封装。 它强制执行**训练三角**——图像 + 规范 + 判断——因为这种绑定是区分可用的 VLM 数据集和一堆带标签图像的关键。

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

### 绑定完整性（三角）

每个视觉训练单元都经过以下三个方面的检查：

1. **图像** — 有效的图像文件（PNG/JPEG/WebP，已提取尺寸，检测到截断）。
2. **规范** — 基于风格规则的规范解释。
3. **判断** — 批准/拒绝状态，以及每个维度的评分。

默认情况下，缺少任何部分的样本会被丢弃。 `--allow-incomplete` 选项允许保留不完整的样本，如果您知道为什么需要它们。

### 输出格式

**原生于框架（推荐）：**

| 格式 | 框架 | DPO 支持 |
|--------|-----------|-------------|
| `trl` | HuggingFace TRL, Unsloth | 是 |
| `axolotl` | Axolotl | 是 |
| `llava` | LLaVA, LLaVA-NeXT | 仅限 SFT |
| `llama_factory` | LLaMA-Factory | 是 |
| `qwen2vl` | Qwen2-VL, MS-Swift | 是 |

**通用：**

| 格式 | 使用场景 |
|--------|----------|
| `visual_universal` | 检查、调试、转换 |
| `visual_dpo` | DPO 偏好对 |
| `visual_kto` | KTO 二元标签 |
| `visual_contrastive` | CLIP 风格的正负对 |
| `visual_pointwise` | 每个资产的质量评分 |

### 标志

```bash
--embed              # Base64-encode images into JSONL
--allow-incomplete   # Keep units without full asset+canon+judgment triangle
--no-copy-images     # Skip copying images to output folder
--no-synthetic       # Skip synthetic pair generation
```

## 反向传播集成

`repo-dataset` 的输出会流入 [backpropagate](https://github.com/mcp-tool-shop-org/backpropagate)，用于本地微调，无需格式转换步骤。

| 目标 | 格式 | 原因 |
|------|--------|-----|
| 代码微调 | `chatml` 或 `alpaca` | 结构化指令对直接映射到代码任务 |
| 对话微调 | `sharegpt` 或 `openai` | 多轮对话结构得以保留 |
| 原始补全 | `completion` | 非结构化文本，用于持续预训练 |

`backpropagate` 接受：`alpaca`, `sharegpt`, `openai`, `chatml`, `completion`。

```bash
# Generate, validate, then fine-tune
repo-dataset generate ./my-project --format chatml --validate
backprop train --data ./my-project-dataset/dataset.jsonl --steps 300
```

视觉流水线（TRL, Axolotl, LLaVA 等）的输出用于视觉-语言模型微调。 `backpropagate` 目前不支持 VLM 训练，请使用原生于框架的格式及其对应的训练器。

## 安全模型

`repo-dataset` 会从您指定的仓库中读取源代码和 Git 历史，并将 JSONL 写入您指定的目录。 它**不会**进行网络请求，收集遥测数据，或访问目标仓库和输出目录之外的文件。 路径遍历和符号链接攻击会受到防护。 请参阅 [SECURITY.md](SECURITY.md) 以报告漏洞。 Shipcheck 的 A-D 级所有测试均已通过（请参阅 [SHIP_GATE.md](SHIP_GATE.md) 和 [SCORECARD.md](SCORECARD.md)）。

## 凭证

来自真实仓库的真实数据集，预计将于 M5 Max 运行时提供（~2026-04-24）。 此部分将包含污染检测、质量等级以及针对我们自己的代码和视觉语料库进行的端到端微调曲线。

在此之前，证明就在测试套件和上述验证器输出中，而不是在营销宣传中。

## 统计信息

- **版本：** 1.2.1
- **测试：** 91 个套件中通过了 460 个测试
- **运行时依赖：** 0
- **Node：** 20+
- **包：** 83 个文件 / 245 kB

## 许可证

MIT

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
