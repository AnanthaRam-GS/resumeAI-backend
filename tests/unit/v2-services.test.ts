import { describe, expect, it } from 'vitest';
import {
  hashNormalizedText,
  normalizeForHash,
  stableJson,
} from '../../src/services/content-hash.service.js';
import {
  assertSupportedOutputLanguage,
  getLanguageLabel,
  isSupportedOutputLanguage,
} from '../../src/services/language.service.js';
import { calculatePortfolioQuality } from '../../src/services/portfolio-quality.service.js';

describe('content hash service', () => {
  it('normalizes whitespace and casing before hashing text', () => {
    expect(normalizeForHash('  TypeScript   API  ')).toBe('typescript api');
    expect(hashNormalizedText('TypeScript API')).toBe(hashNormalizedText(' typescript   api '));
  });

  it('serializes objects with stable key ordering', () => {
    expect(stableJson({ b: 2, a: 1 })).toBe(stableJson({ a: 1, b: 2 }));
  });
});

describe('language service', () => {
  it('accepts supported output languages and rejects unsupported values', () => {
    expect(isSupportedOutputLanguage('en')).toBe(true);
    expect(assertSupportedOutputLanguage('hi')).toBe('hi');
    expect(getLanguageLabel('pt')).toBe('Portuguese');
    expect(() => assertSupportedOutputLanguage('klingon')).toThrow('Unsupported output language');
  });
});

describe('portfolio-quality service', () => {
  it('rewards complete, recent, quantified project evidence', () => {
    const strong = calculatePortfolioQuality({
      type: 'project',
      source: 'github',
      title: 'Realtime Analytics Platform',
      description: 'Built a TypeScript and PostgreSQL analytics platform with streaming dashboards and automated deployments.',
      impact_metrics: 'Reduced reporting latency by 45% for 2,000 users',
      tech_stack: ['TypeScript', 'PostgreSQL', 'Redis', 'Fastify'],
      is_current: true,
      extra: {
        github_enrichment: {
          readme_excerpt: 'Installation usage examples tests CI deployment '.repeat(40),
        },
      },
    });

    const weak = calculatePortfolioQuality({
      type: 'project',
      source: 'manual',
      title: 'Todo',
      description: 'Small app',
      tech_stack: [],
      is_current: false,
    });

    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.score).toBeGreaterThanOrEqual(80);
  });
});

