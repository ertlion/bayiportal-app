export const PLANS = {
  free: {
    name: "Ücretsiz",
    price: 0,
    productLimit: 10,
    marketplaceLimit: 1,
    hasInvoice: false,
    hasAI: false,
    hasCargo: false,
    trialDays: 0,
    description: "10 ürüne kadar, 1 pazaryeri",
  },
  starter: {
    name: "Başlangıç",
    price: 1500,
    productLimit: 500,
    marketplaceLimit: 1,
    hasInvoice: true,
    hasAI: false,
    hasCargo: false,
    trialDays: 7,
    description: "500 ürün, 1 pazaryeri, e-fatura",
  },
  growth: {
    name: "Büyüme",
    price: 3000,
    productLimit: 2000,
    marketplaceLimit: 3,
    hasInvoice: true,
    hasAI: true,
    hasCargo: true,
    trialDays: 7,
    description: "2000 ürün, 3 pazaryeri, AI özellikler, kargo",
  },
  pro: {
    name: "Profesyonel",
    price: 5000,
    productLimit: 999999,
    marketplaceLimit: 999,
    hasInvoice: true,
    hasAI: true,
    hasCargo: true,
    trialDays: 7,
    description: "Sınırsız ürün, tüm pazaryerleri, öncelikli destek",
  },
} as const;

export type PlanId = keyof typeof PLANS;

export function getPlan(planId: string): (typeof PLANS)[PlanId] {
  return PLANS[planId as PlanId] || PLANS.free;
}
