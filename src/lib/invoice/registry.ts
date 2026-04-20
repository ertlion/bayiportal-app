import type { InvoiceAdapter, InvoiceProvider } from "./types";
import { UyumsoftAdapter } from "./adapters/uyumsoft";
import { ParasutAdapter } from "./adapters/parasut";
import { LogoAdapter } from "./adapters/logo";
import { ElogoAdapter } from "./adapters/elogo";
import { KolaybiAdapter } from "./adapters/kolaybi";

const adapters: Record<InvoiceProvider, InvoiceAdapter> = {
  uyumsoft: new UyumsoftAdapter(),
  parasut: new ParasutAdapter(),
  logo: new LogoAdapter(),
  elogo: new ElogoAdapter(),
  kolaybi: new KolaybiAdapter(),
};

export function getInvoiceAdapter(name: InvoiceProvider): InvoiceAdapter {
  const adapter = adapters[name];
  if (!adapter) {
    throw new Error(`Desteklenmeyen fatura saglayici: ${name}`);
  }
  return adapter;
}

export function getAllInvoiceAdapters(): InvoiceAdapter[] {
  return Object.values(adapters);
}

export function getInvoiceProviderNames(): InvoiceProvider[] {
  return Object.keys(adapters) as InvoiceProvider[];
}
