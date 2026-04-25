"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

/* ---------- types ---------- */

type MarketplaceName = "trendyol" | "hepsiburada" | "n11" | "beymen";

interface StepProps {
  onNext: () => void;
  onBack: () => void;
}

interface MarketplaceOption {
  id: MarketplaceName;
  label: string;
  color: string;
  fields: { key: string; label: string; placeholder: string }[];
}

/* ---------- constants ---------- */

const STEPS = [
  "Magaza Bilgileri",
  "Shopify Baglantisi",
  "Pazaryeri Sec",
  "Pazaryeri Bagla",
  "Urun Sync",
  "Otomatik Eslestir",
  "Tamamlandi",
] as const;

const MARKETPLACES: MarketplaceOption[] = [
  {
    id: "trendyol",
    label: "Trendyol",
    color: "border-orange-500 bg-orange-50",
    fields: [
      { key: "trendyol_api_key", label: "API Key", placeholder: "Trendyol API anahtariniz" },
      { key: "trendyol_api_secret", label: "API Secret", placeholder: "Trendyol API secret" },
      { key: "trendyol_seller_id", label: "Satici ID", placeholder: "Trendyol satici numaraniz" },
    ],
  },
  {
    id: "hepsiburada",
    label: "Hepsiburada",
    color: "border-amber-500 bg-amber-50",
    fields: [
      { key: "hb_merchant_id", label: "Merchant ID", placeholder: "Hepsiburada merchant ID" },
      { key: "hb_username", label: "Kullanici Adi", placeholder: "API kullanici adi" },
      { key: "hb_password", label: "Sifre", placeholder: "API sifresi" },
    ],
  },
  {
    id: "n11",
    label: "N11",
    color: "border-purple-500 bg-purple-50",
    fields: [
      { key: "n11_api_key", label: "API Key", placeholder: "N11 API anahtariniz" },
      { key: "n11_api_secret", label: "API Secret", placeholder: "N11 API secret" },
    ],
  },
  {
    id: "beymen",
    label: "Beymen",
    color: "border-gray-500 bg-gray-50",
    fields: [
      { key: "beymen_api_key", label: "API Key", placeholder: "Beymen API anahtariniz" },
      { key: "beymen_api_secret", label: "API Secret", placeholder: "Beymen API secret" },
    ],
  },
];

/* ---------- shared UI ---------- */

function StatusBadge({ status }: { status: "idle" | "loading" | "success" | "error"; }) {
  if (status === "idle") return null;
  const map = {
    loading: { text: "Test ediliyor...", cls: "text-blue-700 bg-blue-50" },
    success: { text: "Baglanti basarili", cls: "text-green-700 bg-green-50" },
    error: { text: "Baglanti basarisiz", cls: "text-red-700 bg-red-50" },
  } as const;
  const s = map[status];
  return (
    <span className={`mt-3 inline-block rounded-md px-3 py-1.5 text-sm font-medium ${s.cls}`}>
      {s.text}
    </span>
  );
}

function NavigationButtons({
  onBack,
  onNext,
  nextLabel = "Ileri",
  nextDisabled = false,
  showBack = true,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  showBack?: boolean;
}) {
  return (
    <div className="mt-8 flex justify-between">
      {showBack ? (
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Geri
        </button>
      ) : (
        <span />
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      >
        {nextLabel}
      </button>
    </div>
  );
}

/* ---------- Step 1: Magaza Bilgileri ---------- */

function StepStoreInfo({ onNext }: Omit<StepProps, "onBack">) {
  const [name, setName] = useState("");

  return (
    <div>
      <h2 className="text-lg font-semibold">Magaza Bilgileri</h2>
      <p className="mt-1 text-sm text-gray-500">
        Magazanizin temel bilgilerini girin.
      </p>

      <div className="mt-6">
        <label htmlFor="store-name" className="block text-sm font-medium text-gray-700">
          Magaza Adi
        </label>
        <input
          id="store-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ornek: Moda Magazam"
          className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <NavigationButtons
        showBack={false}
        onBack={() => {}}
        onNext={onNext}
        nextDisabled={name.trim().length === 0}
      />
    </div>
  );
}

/* ---------- Step 2: Shopify Baglantisi ---------- */

function StepShopify({ onNext, onBack }: StepProps) {
  const [storeUrl, setStoreUrl] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const testConnection = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketplace: "shopify",
          credentials: { shop_url: storeUrl, access_token: token },
        }),
      });
      const data = await res.json();
      setStatus(data.success ? "success" : "error");
    } catch {
      setStatus("error");
    }
  }, [storeUrl, token]);

  return (
    <div>
      <h2 className="text-lg font-semibold">Shopify Baglantisi</h2>
      <p className="mt-1 text-sm text-gray-500">
        Shopify magazanizin URL ve access token bilgilerini girin.
      </p>

      <div className="mt-6 space-y-4">
        <div>
          <label htmlFor="shopify-url" className="block text-sm font-medium text-gray-700">
            Magaza URL
          </label>
          <input
            id="shopify-url"
            type="text"
            value={storeUrl}
            onChange={(e) => setStoreUrl(e.target.value)}
            placeholder="magazam.myshopify.com"
            className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="shopify-token" className="block text-sm font-medium text-gray-700">
            Access Token
          </label>
          <input
            id="shopify-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="shpat_xxxxxxxxxxxxxxxx"
            className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <button
          type="button"
          onClick={testConnection}
          disabled={!storeUrl.trim() || !token.trim() || status === "loading"}
          className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {status === "loading" ? "Test Ediliyor..." : "Baglantiyi Test Et"}
        </button>
        <StatusBadge status={status} />
      </div>

      <NavigationButtons onBack={onBack} onNext={onNext} />
    </div>
  );
}

/* ---------- Step 3: Pazaryeri Sec ---------- */

function StepSelectMarketplace({
  onNext,
  onBack,
  selected,
  onSelect,
}: StepProps & {
  selected: MarketplaceName | null;
  onSelect: (m: MarketplaceName) => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold">Pazaryeri Secin</h2>
      <p className="mt-1 text-sm text-gray-500">
        Entegre etmek istediginiz pazaryerini secin.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {MARKETPLACES.map((mp) => (
          <button
            key={mp.id}
            type="button"
            onClick={() => onSelect(mp.id)}
            className={`rounded-xl border-2 p-5 text-left transition-all ${
              selected === mp.id
                ? `${mp.color} ring-2 ring-offset-2`
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <span className="text-base font-semibold">{mp.label}</span>
          </button>
        ))}
      </div>

      <NavigationButtons onBack={onBack} onNext={onNext} nextDisabled={!selected} />
    </div>
  );
}

/* ---------- Step 4: Pazaryeri Bagla ---------- */

function StepConnectMarketplace({
  onNext,
  onBack,
  marketplace,
}: StepProps & { marketplace: MarketplaceName }) {
  const mp = MARKETPLACES.find((m) => m.id === marketplace);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const updateField = useCallback((key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  }, []);

  const testConnection = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketplace, credentials: fields }),
      });
      const data = await res.json();
      setStatus(data.success ? "success" : "error");
    } catch {
      setStatus("error");
    }
  }, [marketplace, fields]);

  if (!mp) return null;

  const allFilled = mp.fields.every((f) => (fields[f.key] ?? "").trim().length > 0);

  return (
    <div>
      <h2 className="text-lg font-semibold">{mp.label} Baglantisi</h2>
      <p className="mt-1 text-sm text-gray-500">
        {mp.label} API bilgilerinizi girin ve baglantiyi test edin.
      </p>

      <div className="mt-6 space-y-4">
        {mp.fields.map((f) => (
          <div key={f.key}>
            <label htmlFor={f.key} className="block text-sm font-medium text-gray-700">
              {f.label}
            </label>
            <input
              id={f.key}
              type={f.key.includes("secret") || f.key.includes("password") ? "password" : "text"}
              value={fields[f.key] ?? ""}
              onChange={(e) => updateField(f.key, e.target.value)}
              placeholder={f.placeholder}
              className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        ))}

        <button
          type="button"
          onClick={testConnection}
          disabled={!allFilled || status === "loading"}
          className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {status === "loading" ? "Test Ediliyor..." : "Baglantiyi Test Et"}
        </button>
        <StatusBadge status={status} />
      </div>

      <NavigationButtons onBack={onBack} onNext={onNext} />
    </div>
  );
}

/* ---------- Step 5: Urun Sync ---------- */

function StepProductSync({ onNext, onBack }: StepProps) {
  const [progress, setProgress] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [done, setDone] = useState(false);
  const [productCount, setProductCount] = useState(0);

  const startSync = useCallback(async () => {
    setSyncing(true);
    setProgress(0);

    /* simulate progress while real request runs */
    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + 8, 90));
    }, 300);

    try {
      const res = await fetch("/api/products", { method: "POST" });
      const data = await res.json();
      clearInterval(interval);
      setProgress(100);
      setProductCount(data.count ?? 0);
      setDone(true);
    } catch {
      clearInterval(interval);
      setProgress(0);
    } finally {
      setSyncing(false);
    }
  }, []);

  return (
    <div>
      <h2 className="text-lg font-semibold">Urunleri Cek</h2>
      <p className="mt-1 text-sm text-gray-500">
        Shopify magazanizdan urunlerinizi BayiPortal&apos;a aktarin.
      </p>

      <div className="mt-6">
        {!done ? (
          <>
            <button
              type="button"
              onClick={startSync}
              disabled={syncing}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {syncing ? "Urunler Cekiliyor..." : "Urunleri Cek"}
            </button>

            {syncing && (
              <div className="mt-4">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-gray-500">%{progress} tamamlandi</p>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-lg bg-green-50 p-4">
            <p className="text-sm font-medium text-green-800">
              {productCount} urun basariyla aktarildi.
            </p>
          </div>
        )}
      </div>

      <NavigationButtons onBack={onBack} onNext={onNext} />
    </div>
  );
}

/* ---------- Step 6: Otomatik Eslestir ---------- */

function StepAutoMatch({ onNext, onBack }: StepProps) {
  const [matching, setMatching] = useState(false);
  const [result, setResult] = useState<{ matched: number; unmatched: number } | null>(null);

  const startMatch = useCallback(async () => {
    setMatching(true);
    try {
      const res = await fetch("/api/matching/auto", { method: "POST" });
      const data = await res.json();
      setResult({ matched: data.matched ?? 0, unmatched: data.unmatched ?? 0 });
    } catch {
      setResult({ matched: 0, unmatched: 0 });
    } finally {
      setMatching(false);
    }
  }, []);

  return (
    <div>
      <h2 className="text-lg font-semibold">Otomatik Eslestirme</h2>
      <p className="mt-1 text-sm text-gray-500">
        Barkod/SKU bilgilerine gore urunlerinizi pazaryeri urunleriyle eslestirin.
      </p>

      <div className="mt-6">
        {!result ? (
          <button
            type="button"
            onClick={startMatch}
            disabled={matching}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {matching ? "Eslestiriliyor..." : "Barkod ile Eslestir"}
          </button>
        ) : (
          <div className="space-y-2">
            <div className="rounded-lg bg-green-50 p-4">
              <p className="text-sm font-medium text-green-800">
                {result.matched} urun basariyla eslestirildi.
              </p>
            </div>
            {result.unmatched > 0 && (
              <div className="rounded-lg bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-800">
                  {result.unmatched} urun eslestirilemedi. Dashboard uzerinden manuel eslestirme yapabilirsiniz.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <NavigationButtons onBack={onBack} onNext={onNext} />
    </div>
  );
}

/* ---------- Step 7: Tamamlandi ---------- */

function StepComplete() {
  const router = useRouter();

  return (
    <div className="text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <svg
          className="h-8 w-8 text-green-600"
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
      </div>
      <h2 className="mt-4 text-xl font-semibold">Kurulum Tamamlandi!</h2>
      <p className="mt-2 text-sm text-gray-500">
        Magazaniz hazir. Dashboard uzerinden tum islemlerinizi yonetebilirsiniz.
      </p>
      <button
        type="button"
        onClick={() => router.push("/dashboard")}
        className="mt-8 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
      >
        Dashboard&apos;a Git
      </button>
    </div>
  );
}

/* ---------- Progress Bar ---------- */

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          Adim {current + 1} / {total}
        </span>
        <span>{STEPS[current]}</span>
      </div>
      <div className="mt-2 flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= current ? "bg-blue-600" : "bg-gray-200"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------- main page ---------- */

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [selectedMarketplace, setSelectedMarketplace] = useState<MarketplaceName | null>(null);

  const next = useCallback(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), []);
  const back = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  return (
    <div className="flex min-h-screen items-start justify-center bg-gray-50 px-4 py-12 sm:py-20">
      <div className="w-full max-w-lg">
        {/* brand */}
        <h1 className="mb-8 text-center text-xl font-bold">
          Bayi<span className="text-blue-600">Portal</span>{" "}
          <span className="text-sm font-normal text-gray-500">Kurulum Sihirbazi</span>
        </h1>

        {/* progress */}
        <ProgressBar current={step} total={STEPS.length} />

        {/* card */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          {step === 0 && <StepStoreInfo onNext={next} />}
          {step === 1 && <StepShopify onNext={next} onBack={back} />}
          {step === 2 && (
            <StepSelectMarketplace
              onNext={next}
              onBack={back}
              selected={selectedMarketplace}
              onSelect={setSelectedMarketplace}
            />
          )}
          {step === 3 && selectedMarketplace && (
            <StepConnectMarketplace
              onNext={next}
              onBack={back}
              marketplace={selectedMarketplace}
            />
          )}
          {step === 4 && <StepProductSync onNext={next} onBack={back} />}
          {step === 5 && <StepAutoMatch onNext={next} onBack={back} />}
          {step === 6 && <StepComplete />}
        </div>
      </div>
    </div>
  );
}
