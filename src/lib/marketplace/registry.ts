import type { MarketplaceAdapter, MarketplaceName } from "./types";
import { TrendyolAdapter } from "./adapters/trendyol";
import { HepsiburadaAdapter } from "./adapters/hepsiburada";
import { N11Adapter } from "./adapters/n11";
import { PazaramaAdapter } from "./adapters/pazarama";

const adapters: Record<MarketplaceName, MarketplaceAdapter> = {
  trendyol: new TrendyolAdapter(),
  hepsiburada: new HepsiburadaAdapter(),
  n11: new N11Adapter(),
  pazarama: new PazaramaAdapter(),
};

export function getAdapter(name: MarketplaceName): MarketplaceAdapter {
  const adapter = adapters[name];
  if (!adapter) {
    throw new Error(`Desteklenmeyen pazaryeri: ${name}`);
  }
  return adapter;
}

export function getAllAdapters(): MarketplaceAdapter[] {
  return Object.values(adapters);
}

export function getAdapterNames(): MarketplaceName[] {
  return Object.keys(adapters) as MarketplaceName[];
}
