import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BayiPortal - E-Ticaretinizi Tek Panelden Yonetin",
  description:
    "Shopify, Trendyol, Hepsiburada, N11, Beymen - tum pazaryerlerinizi tek panelden yonetin. Stoklar otomatik senkronize, siparisler tek ekranda.",
};

/* ---------- data ---------- */

const features = [
  {
    title: "Stok Entegrasyonu",
    description: "Tum pazaryerlerinde stoklar anlik senkronize",
    icon: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4",
  },
  {
    title: "Siparis Yonetimi",
    description: "Tum siparisler tek panelde, otomatik durum guncellemesi",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
  },
  {
    title: "Urun Eslestirme",
    description: "Barkod/SKU ile otomatik, manuel eslestirme",
    icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
  },
  {
    title: "AI Kategori Onerisi",
    description: "Yapay zeka ile pazaryeri kategorisi ve ozellik onerisi",
    icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  },
  {
    title: "E-Fatura",
    description: "Uyumsoft, Parasut, Logo entegrasyonu, otomatik fatura",
    icon: "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z",
  },
  {
    title: "Kargo Entegrasyonu",
    description: "Yurtici, Aras, otomatik gonderi olusturma",
    icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  },
] as const;

const marketplaces = [
  { name: "Shopify", color: "bg-green-100 text-green-800" },
  { name: "Trendyol", color: "bg-orange-100 text-orange-800" },
  { name: "Hepsiburada", color: "bg-amber-100 text-amber-800" },
  { name: "N11", color: "bg-purple-100 text-purple-800" },
  { name: "Beymen", color: "bg-gray-100 text-gray-800" },
  { name: "Pazarama", color: "bg-red-100 text-red-800" },
] as const;

const plans = [
  {
    name: "Ucretsiz",
    price: "0",
    period: "/ay",
    features: ["10 urun", "1 pazaryeri", "Temel destek"],
    highlighted: false,
  },
  {
    name: "Baslangic",
    price: "1.500",
    period: "/ay",
    features: ["500 urun", "1 pazaryeri", "E-fatura", "E-posta destek"],
    highlighted: false,
  },
  {
    name: "Buyume",
    price: "3.000",
    period: "/ay",
    features: ["2000 urun", "3 pazaryeri", "AI kategori", "Kargo entegrasyonu", "Oncelikli destek"],
    highlighted: true,
  },
  {
    name: "Profesyonel",
    price: "5.000",
    period: "/ay",
    features: ["Sinirsiz urun", "Tum pazaryerleri", "Tum ozellikler", "Oncelikli destek", "Ozel entegrasyon"],
    highlighted: false,
  },
] as const;

/* ---------- components ---------- */

function FeatureIcon({ d }: { d: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-8 w-8 text-blue-600"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

/* ---------- page ---------- */

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* ===== Header / Nav ===== */}
      <header className="bg-gray-950 text-white">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <span className="text-xl font-bold tracking-tight">
            Bayi<span className="text-blue-400">Portal</span>
          </span>
          <div className="flex items-center gap-4">
            <Link
              href="#fiyatlar"
              className="hidden text-sm text-gray-300 hover:text-white sm:inline-block"
            >
              Fiyatlar
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Giris Yap
            </Link>
          </div>
        </nav>
      </header>

      {/* ===== Hero ===== */}
      <section className="bg-gray-950 pb-20 pt-16 text-white sm:pb-28 sm:pt-24">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            E-Ticaretinizi Tek Panelden Yonetin
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-gray-400 sm:text-lg">
            Shopify, Trendyol, Hepsiburada, N11, Beymen &mdash; tum pazaryerlerinizi tek panelden
            yonetin. Stoklar otomatik senkronize, siparisler tek ekranda.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-lg hover:bg-blue-700 transition-colors"
            >
              Ucretsiz Basla
            </Link>
            <a
              href="mailto:destek@bayiportal.com?subject=Demo%20Talebi"
              className="inline-flex items-center rounded-lg border border-gray-600 px-6 py-3 text-base font-semibold text-gray-300 hover:border-gray-400 hover:text-white transition-colors"
            >
              Demo Iste
            </a>
          </div>
        </div>
      </section>

      {/* ===== Features Grid ===== */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">
            Her Sey Tek Panelde
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-gray-500">
            Pazaryeri entegrasyonlarinizi kurun, stok ve siparis yonetimini otomatiklestirin.
          </p>

          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <article
                key={f.title}
                className="rounded-xl border border-gray-200 p-6 transition-shadow hover:shadow-lg"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50">
                  <FeatureIcon d={f.icon} />
                </div>
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-gray-500">{f.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Marketplace Logos ===== */}
      <section className="border-y border-gray-100 bg-gray-50 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-xl font-bold sm:text-2xl">
            Desteklenen Pazaryerleri
          </h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {marketplaces.map((m) => (
              <span
                key={m.name}
                className={`rounded-full px-5 py-2 text-sm font-medium ${m.color}`}
              >
                {m.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Pricing ===== */}
      <section id="fiyatlar" className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Fiyatlandirma</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-gray-500">
            Isletme buyuklugu ne olursa olsun, size uygun bir plan var.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={`relative flex flex-col rounded-xl border p-6 ${
                  plan.highlighted
                    ? "border-blue-600 ring-2 ring-blue-600 shadow-xl"
                    : "border-gray-200"
                }`}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-0.5 text-xs font-semibold text-white">
                    Populer
                  </span>
                )}
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-4">
                  <span className="text-3xl font-extrabold">
                    &#8378;{plan.price}
                  </span>
                  <span className="text-sm text-gray-500">{plan.period}</span>
                </p>

                <ul className="mt-6 flex-1 space-y-3 text-sm text-gray-600" role="list">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <svg
                        className="mt-0.5 h-4 w-4 shrink-0 text-blue-600"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/dashboard"
                  className={`mt-8 block rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors ${
                    plan.highlighted
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-gray-100 text-gray-900 hover:bg-gray-200"
                  }`}
                >
                  Basla
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="border-t border-gray-200 bg-gray-50">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 py-8 text-sm text-gray-500 sm:flex-row sm:justify-between sm:px-6 lg:px-8">
          <span>BayiPortal &copy; {new Date().getFullYear()}</span>
          <nav className="flex gap-6">
            <a href="#" className="hover:text-gray-900 transition-colors">
              Gizlilik
            </a>
            <a href="#" className="hover:text-gray-900 transition-colors">
              Kullanim Kosullari
            </a>
            <a
              href="mailto:destek@bayiportal.com"
              className="hover:text-gray-900 transition-colors"
            >
              Iletisim
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
