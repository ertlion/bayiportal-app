export const PLANS = {
  free: {
    name: "Ücretsiz",
    price: 0,
    productLimit: 10,
    marketplaceLimit: 1,
    hasInvoice: false,
    hasAI: false,
    trialDays: 0,
  },
  starter: {
    name: "Starter",
    price: 299,
    productLimit: 100,
    marketplaceLimit: 3,
    hasInvoice: true,
    hasAI: false,
    trialDays: 7,
  },
  pro: {
    name: "Pro",
    price: 599,
    productLimit: 999999,
    marketplaceLimit: 999,
    hasInvoice: true,
    hasAI: true,
    trialDays: 7,
  },
} as const;

export type PlanId = keyof typeof PLANS;

export function getPlan(planId: string): (typeof PLANS)[PlanId] {
  return PLANS[planId as PlanId] || PLANS.free;
}
