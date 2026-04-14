<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/repo-dataset/readme.png" width="400" alt="Repo Dataset">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/actions"><img src="https://github.com/mcp-tool-shop-org/repo-dataset/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/repo-dataset"><img src="https://img.shields.io/npm/v/@mcptoolshop/repo-dataset" alt="npm"></a>
</p>

任意のGitリポジトリまたはビジュアルスタイルリポジトリを、LLM（大規模言語モデル）のトレーニングデータセットに変換します。

**コードパイプライン:** コード、コミット、ドキュメント、およびテストからトレーニング信号を抽出します。微調整または事前トレーニングの準備ができた6つの形式でJSONLを出力します。

**ビジュアルパイプライン:** 厳選されたビジュアルリポジトリから、マルチモーダルなトレーニングデータを抽出します。画像の検証を行い、アセットとキャノン（基準）と判断の関連性を強制し、ビジョン・ランゲージモデルの微調整用に10種類のフレームワークネイティブな形式で出力します。

## セキュリティモデル

repo-datasetは、指定されたリポジトリからソースファイルとGitの履歴を読み込みます。JSONL形式の出力を指定されたディレクトリに書き込みます。**ネットワークリクエストを行わず、テレメトリを収集せず、ターゲットリポジトリおよび出力ディレクトリ以外のファイルにアクセスしません。** パス穿越攻撃やシンボリックリンク攻撃に対する防御が施されています。脆弱性の報告については、[SECURITY.md](SECURITY.md)を参照してください。

## インストール

```bash
npm install -g @mcptoolshop/repo-dataset
```

## コードパイプライン

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

### コード出力形式

| 形式 | ユースケース |
|--------|----------|
| `alpaca` | 教師あり微調整（指示/入力/出力） |
| `sharegpt` | マルチターン会話の微調整 |
| `openai` | OpenAIメッセージ形式 |
| `raw` | 継続的な事前トレーニング / RAG（Retrieval-Augmented Generation）への取り込み |
| `completion` | テキストとしての生のコード（言語モデリング） |
| `fim` | Fill-in-the-middle（StarCoderトークン） |

### コード抽出器

| 抽出器 | ソース | トレーニング信号 |
|-----------|--------|-----------------|
| `code` | ソースファイル | インポートコンテキスト付きの関数/クラスの抽出 |
| `commits` | Gitの履歴 | 変更の説明ペア |
| `docs` | Markdownファイル | セクションベースの概念説明 |
| `tests` | テストファイル | コードからテストへの生成ペア |

## ビジュアルパイプライン

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

### ビジュアル出力形式

**フレームワークネイティブ（推奨）:**

| 形式 | フレームワーク | DPO（Direct Preference Optimization）サポート |
|--------|-----------|-------------|
| `trl` | HuggingFace TRL、Unsloth | はい |
| `axolotl` | Axolotl | はい |
| `llava` | LLaVA、LLaVA-NeXT | SFT（Supervised Fine-Tuning）のみ |
| `llama_factory` | LLaMA-Factory | はい |
| `qwen2vl` | Qwen2-VL、MS-Swift | はい |

**汎用:**

| 形式 | ユースケース |
|--------|----------|
| `visual_universal` | 検査、デバッグ、変換 |
| `visual_dpo` | DPOの好みのペア |
| `visual_kto` | KTOの二値ラベル |
| `visual_contrastive` | CLIPスタイルのポジティブ/ネガティブペア |
| `visual_pointwise` | アセットごとの品質スコア |

### ビジュアルフラグ

```bash
--embed              # Base64-encode images into JSONL
--allow-incomplete   # Keep units without full asset+canon+judgment triangle
--no-copy-images     # Skip copying images to output folder
--no-synthetic       # Skip synthetic pair generation
```

### 整合性の検証

すべてのビジュアルトレーニングユニットについて、**トレーニングトライアングル**がチェックされます。

1. **画像:** 有効な画像ファイル（PNG/JPEG/WebP）、次元の抽出、トリミングの検出
2. **キャノン:** スタイルルールに基づいた基準となる説明
3. **判断:** 承認/拒否ステータスと、各次元ごとのスコア

3つの要素すべてを満たしていないユニットは、デフォルトで除外されます。部分的なユニットを保持するには、`--allow-incomplete`オプションを使用します。

## バックプロパゲーション統合

repo-datasetの出力は、ローカルでの微調整を行うための[backpropagate](https://github.com/mcp-tool-shop-org/backpropagate)と互換性があります。

### 推奨形式

| 目的 | 形式 | 理由 |
|------|--------|-----|
| コードの微調整 | `chatml`または`alpaca` | 構造化された指示ペアが、直接コードタスクにマッピングされます。 |
| チャットの微調整 | `sharegpt`または`openai` | マルチターン会話の構造が保持されます。 |
| 生の補完 | `completion` | 継続的な事前トレーニングのための非構造化テキスト |

Backpropagateは、`alpaca`、`sharegpt`、`openai`、`chatml`、および`completion`を受け入れます。

### エンドツーエンドのワークフロー

```bash
# Generate training data from your repo
repo-dataset generate ./my-project --format chatml --validate

# Fine-tune with backpropagate
backprop train --data ./my-project-dataset/dataset.jsonl --steps 300
```

### ビジュアルデータセット

視覚情報とテキストを組み合わせたモデルの微調整を対象とする、様々なパイプライン出力（TRL、Axolotl、LLaVAなど）があります。Backpropagateは、現時点ではVLM（Vision-Language Model：視覚情報とテキストを組み合わせたモデル）のトレーニングをサポートしていません。そのため、それぞれのトレーニングツールで提供されている、ネイティブのフォーマットを直接使用してください。

## 統計情報

- **バージョン:** 1.1.0
- **テスト数:** 445
- **実行時依存関係:** 0
- **Node:** 20以上

## ライセンス

MIT

---

作成者: <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
