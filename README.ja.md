<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/repo-dataset/readme.png" width="500" alt="Repo Dataset">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/actions"><img src="https://github.com/mcp-tool-shop-org/repo-dataset/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/repo-dataset/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/repo-dataset"><img src="https://img.shields.io/npm/v/@mcptoolshop/repo-dataset" alt="npm"></a>
</p>

### トレーニングを開始する前に、リポジトリからトレーニングデータを作成します

repo-datasetは、コード、コミット、ドキュメント、テスト、およびキュレーションされた視覚アセットを、トレーニングに適したデータセットに変換します。その後、品質、整合性、および汚染のリスクをチェックし、不適切なデータでファインチューニングを行うことを防ぎます。

repo-datasetは、ローカルの機械学習ワークフローのためのデータセット構築および検証レイヤーです。 トレーナーではありません。 また、フォーマット変換ツールでもありません。

## 概要 / 概要

- **トレーニングツールではありません。** JSONL形式で処理を停止します。 [backpropagate](https://github.com/mcp-tool-shop-org/backpropagate)、Axolotl、TRL、LLaMA-Factory、LLaVA、またはQwen2-VLなどと組み合わせて使用します。
- **別のフォーマット変換ツールではありません。** フォーマットの多様性は基本であり、それ以上の機能（汚染チェック、品質評価、整合性）が製品の価値です。
- **ローカルの機械学習ワークフローのためのデータセット構築および検証レイヤーです。** トレーニング前に実行され、ファインチューニングに悪影響を及ぼす可能性のある要素を特定します。
- **[style-dataset-lab](https://github.com/mcp-tool-shop-org/style-dataset-lab)の代替ではなく、補完的なツールです。** style-dataset-labは、作成されたスタイルガイドと視覚データセットのための専門的なシステムです。一方、repo-datasetは、コードや視覚データなど、あらゆるリポジトリで使用できる、より広範なデータセット構築および検証レイヤーです。

## 対象ユーザー

- 独自のコードで小規模なモデルをトレーニングし、データセットが実際にトレーニングに適しているかどうかを知りたい、個人開発者。
- VLMのファインチューニングのために、プライベートな視覚データセットをキュレーションする必要があり、信頼ではなく、アセット、規範、および判断の整合性を強制したいチーム。
- データセットまたは論文を公開する前に、汚染の監査（機密情報、個人情報、ベンチマークの署名など）が必要な研究者。

## インストール

```bash
npm install -g @mcptoolshop/repo-dataset
```

## 汚染チェック

このツールが存在する理由。 データセットを生成した後、`validate`コマンドは、そのデータセットがトレーナーに安全に適用できるかどうかを判断するために使用されます。

```bash
repo-dataset validate ./dataset-output/dataset.jsonl
```

出力は以下のようになります（形状のみ。実際の数値はコーパスによって異なります）。

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

評価は結果です。 機密情報、個人情報、またはベンチマークの署名を含むレコードは、個々のレコードごとにフラグが立てられ、それらを削除したり、修正したり、または生成元を再生成したりすることができます。これにより、トレーナーがファイルにアクセスする前に問題を修正できます。

## コードパイプライン

```bash
# Generate training data from a code repo
repo-dataset generate ./my-project --format alpaca

# Preview extraction (dry run)
repo-dataset inspect ./my-project

# Control signal balance across extractors
repo-dataset generate ./my-project --format completion --auto-balance
```

### 出力形式

| 形式 | ユースケース |
|--------|----------|
| `alpaca` | 教師ありファインチューニング（指示/入力/出力） |
| `sharegpt` | マルチターン会話ファインチューニング |
| `openai` | OpenAIメッセージ形式 |
| `chatml` | ChatMLロールトークン（Mistral、Hermes、OpenHermes） |
| `raw` | 継続的な事前学習/RAGへの取り込み |
| `completion` | テキストとしての生コード（言語モデリング） |
| `fim` | 穴埋め（StarCoderトークン） |

### 抽出器

| 抽出器 | ソース | トレーニング信号 |
|-----------|--------|-----------------|
| `code` | ソースファイル | インポートコンテキスト付きの関数/クラス抽出 |
| `commits` | Git履歴 | 変更説明ペア |
| `docs` | Markdownファイル | セクションベースの概念説明 |
| `tests` | テストファイル | コードからテストへの生成ペア |
| `config` | 構造化ファイル | Dockerfile、tsconfig、Cargo.toml、CIワークフローなど。 |

## 視覚パイプライン

視覚パイプラインは、コードパイプラインの単純なラッパーではありません。 **トレーニングのトライアングル（画像 + 規範 + 判断）**を強制します。なぜなら、この整合性が、使用可能なVLMデータセットと、ラベル付けされた画像の寄せ集めを区別するからです。

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

### 整合性（トライアングル）

視覚的なトレーニングユニットごとに、以下の3つの項目がチェックされます。

1. **画像** — 有効な画像ファイル (PNG/JPEG/WebP、寸法は抽出され、切り捨てが検出されます)。
2. **標準** — スタイルルールに基づいた標準的な説明。
3. **判定** — 承認/拒否のステータスと、各次元ごとのスコア。

片方の脚が欠損しているユニットは、デフォルトで除外されます。 `--allow-incomplete` オプションを使用すると、意図的に部分的なデータを含めることができます。

### 出力形式

**フレームワークネイティブ (推奨):**

| 形式 | フレームワーク | DPOサポート |
|--------|-----------|-------------|
| `trl` | HuggingFace TRL、Unsloth | はい |
| `axolotl` | Axolotl | はい |
| `llava` | LLaVA、LLaVA-NeXT | SFTのみ |
| `llama_factory` | LLaMA-Factory | はい |
| `qwen2vl` | Qwen2-VL、MS-Swift | はい |

**汎用:**

| 形式 | ユースケース |
|--------|----------|
| `visual_universal` | 検査、デバッグ、変換 |
| `visual_dpo` | DPOの優先順位ペア |
| `visual_kto` | KTOの二値ラベル |
| `visual_contrastive` | CLIPスタイルの正/負ペア |
| `visual_pointwise` | アセットごとの品質スコア |

### フラグ

```bash
--embed              # Base64-encode images into JSONL
--allow-incomplete   # Keep units without full asset+canon+judgment triangle
--no-copy-images     # Skip copying images to output folder
--no-synthetic       # Skip synthetic pair generation
```

## バックプロパゲーション統合

`repo-dataset` の出力は、形式変換なしでローカルファインチューニングを行うための [backpropagate](https://github.com/mcp-tool-shop-org/backpropagate) に入力されます。

| 目的 | 形式 | 理由 |
|------|--------|-----|
| コードファインチューニング | `chatml` または `alpaca` | 構造化された指示ペアが、直接コードタスクにマッピングされます。 |
| チャットファインチューニング | `sharegpt` または `openai` | マルチターン会話の構造が保持されます。 |
| 生の補完 | `completion` | 継続的な事前学習のための非構造化テキスト |

`backpropagate` は、`alpaca`、`sharegpt`、`openai`、`chatml`、`completion` を受け入れます。

```bash
# Generate, validate, then fine-tune
repo-dataset generate ./my-project --format chatml --validate
backprop train --data ./my-project-dataset/dataset.jsonl --steps 300
```

ビジュアルパイプラインの出力 (TRL、Axolotl、LLaVAなど) は、ビジョン・ランゲージモデルのファインチューニングを対象としています。 `backpropagate` は、まだVLMのトレーニングをサポートしていません。フレームワークネイティブの形式を使用し、それぞれのトレーナーを使用してください。

## セキュリティモデル

`repo-dataset` は、指定されたリポジトリからソースファイルとGitの履歴を読み込み、指定されたディレクトリにJSONL形式で書き込みます。 ネットワークリクエストを行ったり、テレメトリを収集したり、ターゲットリポジトリおよび出力ディレクトリ以外のファイルにアクセスしたりすることはありません。 パス穿越攻撃やシンボリックリンク攻撃に対する対策が施されています。 脆弱性に関する報告は、[SECURITY.md](SECURITY.md) を参照してください。 Shipcheck のハードゲート A～D はすべて合格しています ( [SHIP_GATE.md](SHIP_GATE.md) および [SCORECARD.md](SCORECARD.md) を参照)。

## レシート

実際のデータセットが、実際のレポジトリから提供されます。 M5 Max での実行結果 (約2026年4月24日) が含まれます。 このセクションには、独自のコードおよびビジュアルコーパスに対するドッグフードテストの結果として得られた、汚染の検出、品質評価、およびエンドツーエンドのファインチューニングの曲線が掲載されます。

それまでは、テストスイートと上記のバリデータ出力形状が、その証拠となります。マーケティングの宣伝文句ではありません。

## 統計

- **バージョン:** 1.2.1
- **テスト:** 91のスイートで460件が合格
- **実行時依存関係:** 0
- **Node:** 20+
- **パッケージ:** 83ファイル / 245 kB

## ライセンス

MIT

---

構築者: <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a
