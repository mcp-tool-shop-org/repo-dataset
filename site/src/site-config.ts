import type { SiteConfig } from '@mcptoolshop/site-theme';

export const config: SiteConfig = {
  title: 'Repo Dataset',
  description: 'Convert any git repository or visual style repo into LLM training datasets',
  logoBadge: 'RD',
  brandName: 'repo-dataset',
  repoUrl: 'https://github.com/mcp-tool-shop-org/repo-dataset',
  npmUrl: 'https://www.npmjs.com/package/@mcptoolshop/repo-dataset',
  footerText: 'MIT Licensed — built by <a href="https://github.com/mcp-tool-shop-org" style="color:var(--color-muted);text-decoration:underline">mcp-tool-shop-org</a>',

  hero: {
    badge: 'v1.2.0',
    headline: 'Repo Dataset',
    headlineAccent: 'Scientific-grade training data.',
    description: 'Extract code, commits, docs, configs, and visual assets from any repo — output as JSONL in 8 formats for fine-tuning with backpropagate or any LLM training framework.',
    primaryCta: { href: '#usage', label: 'Get started' },
    secondaryCta: { href: 'handbook/', label: 'Read the Handbook' },
    previews: [
      { label: 'Install', code: 'npm i -g @mcptoolshop/repo-dataset' },
      { label: 'Generate', code: 'repo-dataset generate ./my-project --format chatml --validate' },
      { label: 'Train', code: 'backprop train --data ./dataset/dataset.jsonl --steps 300' },
    ],
  },

  sections: [
    {
      kind: 'features',
      id: 'features',
      title: 'Features',
      subtitle: 'A scientific instrument for training data.',
      features: [
        { title: '8 Output Formats', desc: 'Alpaca, ShareGPT, OpenAI, ChatML, completion, FIM, raw — plus 10 visual formats for VLM training.' },
        { title: 'MinHash Near-Dedup', desc: 'Exact SHA-256 + MinHash LSH near-duplicate detection with configurable Jaccard threshold.' },
        { title: 'Contamination Checks', desc: 'Validates against leaked secrets, PII, and HumanEval benchmark signatures before training.' },
        { title: '460 Tests, Zero Deps', desc: 'Pure TypeScript, no runtime dependencies. Every quality gate is tested.' },
        { title: '5 Extractors', desc: 'Code, commits, docs, tests, and config files — each with language-aware token estimation.' },
        { title: 'Backpropagate Ready', desc: 'Format-aware integration with backpropagate for local LoRA fine-tuning in 3 lines.' },
      ],
    },
    {
      kind: 'code-cards',
      id: 'usage',
      title: 'Usage',
      cards: [
        { title: 'Code Training Data', code: 'repo-dataset generate ./my-project \\\n  --format chatml \\\n  --auto-balance \\\n  --validate' },
        { title: 'Visual Training Data', code: 'repo-dataset visual generate ./sprites \\\n  --format trl \\\n  --embed \\\n  --min-quality 0.4' },
        { title: 'Multi-Repo Merge', code: 'repo-dataset merge \\\n  repo-a/dataset.jsonl \\\n  repo-b/dataset.jsonl \\\n  --output combined.jsonl' },
        { title: 'Quality Validation', code: 'repo-dataset validate ./dataset.jsonl\n# Grade: B (78/100)\n# Secrets: 0 | PII: 0 | Benchmark: 0' },
      ],
    },
  ],
};
