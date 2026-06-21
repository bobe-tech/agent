import config from '../../core/config.json' with { type: 'json' };
import type { PairCfg } from '../../core/market.d.ts';

interface Config {
  pairs: Record<string, PairCfg>;
}

const cfg = config as Config;

export function listPairs(): string[] {
  return Object.keys(cfg.pairs);
}

export function getPairCfg(pair: string): PairCfg | null {
  return cfg.pairs[pair] ?? null;
}

export function isKnownPair(pair: string): boolean {
  return Object.prototype.hasOwnProperty.call(cfg.pairs, pair);
}
