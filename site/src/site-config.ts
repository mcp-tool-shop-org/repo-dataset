import type { SiteConfig } from '@mcptoolshop/site-theme';

export const config: SiteConfig = {
  title: 'Repo Dataset',
  description: 'The dataset construction and verification layer for local ML workflows — contamination-aware, quality-scored, trainer-ready.',
  logoBadge: 'RD',
  brandName: 'repo-dataset',
  repoUrl: 'https://github.com/mcp-tool-shop-org/repo-dataset',
  npmUrl: 'https://www.npmjs.com/package/@mcptoolshop/repo-dataset',
  footerText: 'MIT Licensed — built by <a href="https://github.com/mcp-tool-shop-org" style="color:var(--color-muted);text-decoration:underline">mcp-tool-shop-org</a>',

  hero: {
    badge: 'v1.2.1',
    headline: 'Build training data from repos',
    headlineAccent: 'before you touch the trainer.',
    description: 'repo-dataset turns code, commits, docs, tests, and curated visual assets into trainer-ready datasets — then checks quality, binding integrity, and contamination risk so you do not fine-tune on junk.',
    primaryCta: { href: '#verify', label: 'See the contamination check' },
    secondaryCta: { href: 'handbook/', label: 'Read the Handbook' },
    previews: [
      { label: 'Install', code: 'npm i -g @mcptoolshop/repo-dataset' },
      { label: 'Verify', code: 'repo-dataset validate ./dataset.jsonl' },
      { label: 'Generate', code: 'repo-dataset generate ./my-project --format chatml --validate' },
    ],
  },

  sections: [
    {
      kind: 'code-cards',
      id: 'verify',
      title: 'The contamination check',
      subtitle: 'repo-dataset flags what would poison a fine-tune run — before you waste a training run on it.',
      cards: [
        {
          title: 'Leaked secrets',
          code: 'repo-dataset validate ./dataset.jsonl --check secrets\n\n# secrets:\n#   scanned: <n> records\n#   flagged: <n>\n#   patterns: aws_key | github_pat | private_key | bearer_token\n#   action:   quarantined to ./dataset.secrets.jsonl',
        },
        {
          title: 'PII patterns',
          code: 'repo-dataset validate ./dataset.jsonl --check pii\n\n# pii:\n#   scanned: <n> records\n#   flagged: <n>\n#   patterns: email | phone | ssn | ip_address\n#   action:   redacted inline or quarantined',
        },
        {
          title: 'Benchmark leakage (HumanEval)',
          code: 'repo-dataset validate ./dataset.jsonl --check benchmarks\n\n# benchmarks:\n#   humaneval_signatures: <n> matches\n#   exact_overlap:        <n> records\n#   near_duplicate_lsh:   <n> records (jaccard >= 0.8)\n#   action:               excluded from training split',
        },
        {
          title: 'Letter-grade quality score',
          code: 'repo-dataset validate ./dataset.jsonl\n\n# grade:       <A | B | C | D | F>\n# score:       <0-100>\n# secrets:     <n>\n# pii:         <n>\n# benchmark:   <n>\n# duplicates:  <n>  (exact + minhash-lsh)\n# bindings:    image+canon+judgment complete: <n>/<total>',
        },
      ],
    },
    {
      kind: 'features',
      id: 'features',
      title: 'What it does',
      subtitle: 'Construction and verification, not training.',
      features: [
        { title: '7 Code Formats + 10 Visual Formats', desc: '7 code formats (alpaca, sharegpt, openai, chatml, raw, completion, fim) and 10 visual formats across 2 paradigms for VLM work.' },
        { title: 'MinHash Near-Dedup', desc: 'Exact SHA-256 plus MinHash LSH (64 hashes, 8 bands, threshold 0.8) to catch near-duplicate records that inflate scores.' },
        { title: 'Contamination Checks', desc: 'Scans every record for leaked secrets, PII patterns, and HumanEval benchmark signatures. Flagged records are quarantined, not silently kept.' },
        { title: '460 Tests, Zero Deps', desc: 'Pure TypeScript, zero runtime dependencies, Node 20+. Every quality gate has a test covering it.' },
        { title: '5 Extractors', desc: 'Code, commits, docs, tests, and config files — each with language-aware token estimation so your context budget is honest.' },
        { title: 'Visual Triangle Enforcement', desc: 'Every multimodal unit binds image + canon + judgment. Partials are dropped unless --allow-incomplete.' },
        { title: 'Backpropagate Ready', desc: 'Emits format-aware JSONL that backpropagate ingests directly for downstream LoRA fine-tuning.' },
      ],
    },
    {
      kind: 'code-cards',
      id: 'usage',
      title: 'Usage',
      cards: [
        { title: 'Code dataset', code: 'repo-dataset generate ./my-project \\\n  --format chatml \\\n  --auto-balance \\\n  --validate' },
        { title: 'Visual dataset', code: 'repo-dataset visual generate ./sprites \\\n  --format trl \\\n  --embed \\\n  --min-quality 0.4' },
        { title: 'Multi-repo merge', code: 'repo-dataset merge \\\n  repo-a/dataset.jsonl \\\n  repo-b/dataset.jsonl \\\n  --output combined.jsonl' },
        { title: 'Quality validation', code: 'repo-dataset validate ./dataset.jsonl\n# grade:      <A-F> (<0-100>)\n# secrets:    <n>\n# pii:        <n>\n# benchmark:  <n>' },
      ],
    },
  ],
};
