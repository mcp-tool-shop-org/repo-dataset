<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/repo-dataset/readme.png" width="400" alt="Repo Dataset">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/actions"><img src="https://github.com/mcp-tool-shop-org/repo-dataset/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/repo-dataset"><img src="https://img.shields.io/npm/v/@mcptoolshop/repo-dataset" alt="npm"></a>
</p>

将任何 Git 仓库或视觉风格仓库转换为 LLM 训练数据集。

**代码流水线：** 从代码、提交、文档和测试中提取训练信号。输出 JSONL 格式，共有 6 种，可用于微调或预训练。

**视觉流水线：** 从经过筛选的视觉仓库中提取多模态训练数据。验证图像，强制执行资产+规范+判断的绑定，并以 10 种框架原生格式输出，用于视觉-语言模型的微调。

## 安全模型

repo-dataset 读取指定仓库中的源代码文件和 Git 历史记录。它将 JSONL 输出写入您指定的目录。它**不**进行网络请求，不收集遥测数据，也不访问目标仓库和输出目录之外的文件。它会防御路径遍历和符号链接攻击。请参阅 [SECURITY.md](SECURITY.md) 以报告漏洞。

## 安装

```bash
npm install -g @mcptoolshop/repo-dataset
```

## 代码流水线

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

### 代码输出格式

| 格式 | 使用场景 |
|--------|----------|
| `alpaca` | 监督微调（指令/输入/输出） |
| `sharegpt` | 多轮对话微调 |
| `openai` | OpenAI 消息格式 |
| `raw` | 持续预训练/RAG 数据导入 |
| `completion` | 原始代码作为文本（语言建模） |
| `fim` | 填空（StarCoder 令牌） |

### 代码提取器

| 提取器 | 来源 | 训练信号 |
|-----------|--------|-----------------|
| `code` | 源代码文件 | 带有导入上下文的函数/类提取 |
| `commits` | Git 历史记录 | 变更解释对 |
| `docs` | Markdown 文件 | 基于章节的概念解释 |
| `tests` | 测试文件 | 代码到测试生成对 |

## 视觉流水线

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

### 视觉输出格式

**框架原生（推荐）：**

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
| `visual_kto` | KTO 二进制标签 |
| `visual_contrastive` | CLIP 风格的正/负对 |
| `visual_pointwise` | 每个资产的质量分数 |

### 视觉标志

```bash
--embed              # Base64-encode images into JSONL
--allow-incomplete   # Keep units without full asset+canon+judgment triangle
--no-copy-images     # Skip copying images to output folder
--no-synthetic       # Skip synthetic pair generation
```

### 绑定完整性

每个视觉训练单元都会检查 **训练三角**：

1. **图像** — 有效的图像文件（PNG/JPEG/WebP，提取尺寸，检测截断）
2. **规范** — 基于风格规则的规范解释
3. **判断** — 带有每个维度的分数的批准/拒绝状态

缺少所有三个部分的单元默认会被丢弃。使用 `--allow-incomplete` 保留部分单元。

## 反向传播集成

repo-dataset 的输出与 [backpropagate](https://github.com/mcp-tool-shop-org/backpropagate) 兼容，可用于本地微调。

### 推荐格式

| 目标 | 格式 | 原因 |
|------|--------|-----|
| 代码微调 | `chatml` 或 `alpaca` | 结构化指令对直接映射到代码任务 |
| 聊天微调 | `sharegpt` 或 `openai` | 多轮对话结构得以保留 |
| 原始补全 | `completion` | 用于持续预训练的非结构化文本 |

Backpropagate 接受：`alpaca`、`sharegpt`、`openai`、`chatml` 和 `completion`。

### 端到端工作流程

```bash
# Generate training data from your repo
repo-dataset generate ./my-project --format chatml --validate

# Fine-tune with backpropagate
backprop train --data ./my-project-dataset/dataset.jsonl --steps 300
```

### 视觉数据集

视觉流水线输出（如TRL、Axolotl、LLaVA等）主要用于视觉-语言模型微调。Backpropagate目前不支持视觉-语言模型训练，请直接使用框架原生格式，并配合各自的训练器。

## 统计信息

- **版本：** 1.1.0
- **测试用例：** 445
- **运行时依赖：** 0
- **Node版本：** 20+

## 许可证

MIT

---

由<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>构建。
