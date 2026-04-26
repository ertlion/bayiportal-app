import type { CargoAdapter, CargoProvider } from "./types";
import { YurticiAdapter } from "./adapters/yurtici";
import { ArasAdapter } from "./adapters/aras";
import { MngAdapter } from "./adapters/mng";

const adapters: Record<CargoProvider, CargoAdapter> = {
  yurtici: new YurticiAdapter(),
  aras: new ArasAdapter(),
  mng: new MngAdapter(),
};

export function getCargoAdapter(name: CargoProvider): CargoAdapter {
  const adapter = adapters[name];
  if (!adapter) {
    throw new Error(`Desteklenmeyen kargo saglayici: ${name}`);
  }
  return adapter;
}

export function getAllCargoAdapters(): CargoAdapter[] {
  return Object.values(adapters);
}

export function getCargoProviderNames(): CargoProvider[] {
  return Object.keys(adapters) as CargoProvider[];
}
