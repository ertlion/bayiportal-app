"use client";

import { useState, useEffect, useCallback } from "react";

type Marketplace = "trendyol" | "hepsiburada" | "n11" | "pazarama";

interface ShopifyVariant {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  inventoryItemId: string;
  inventory_quantity: number;
}

interface ShopifyProduct {
  id: number;
  shopifyProductId: string;
  title: string;
  image: string | null;
  variants: ShopifyVariant[];
}

interface MarketplaceVariant {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  stockQuantity: number;
}

interface MarketplaceProduct {
  id: number;
  externalProductId: string;
  title: string;
  image: string | null;
  variants: MarketplaceVariant[];
}

interface Matching {
  id: number;
  marketplace: string;
  shopifyTitle: string | null;
  shopifyBarcode: string | null;
  shopifySku: string | null;
  marketplaceTitle: string | null;
  marketplaceBarcode: string | null;
  matchType: string;
  isActive: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
}

interface Settings {
  shop: { domain: string; plan: string; productLimit: number; marketplace: string | null };
  marketplaces: Array<{ marketplace: string; isActive: boolean; testResult: string | null }>;
}

const MARKETPLACES: { id: Marketplace; name: string; fields: { key: string; label: string; type?: string }[] }[] = [
  {
    id: "trendyol",
    name: "Trendyol",
    fields: [
      { key: "trendyol_api_key", label: "API Key" },
      { key: "trendyol_api_secret", label: "API Secret", type: "password" },
      { key: "trendyol_seller_id", label: "Satıcı ID" },
    ],
  },
  {
    id: "hepsiburada",
    name: "Hepsiburada",
    fields: [
      { key: "hb_merchant_id", label: "Mağaza ID (Merchant ID)" },
      { key: "hb_password", label: "Servis Şifresi", type: "password" },
    ],
  },
  {
    id: "n11",
    name: "N11",
    fields: [
      { key: "n11_api_key", label: "API Key" },
      { key: "n11_api_secret", label: "API Secret", type: "password" },
    ],
  },
  {
    id: "pazarama",
    name: "Pazarama",
    fields: [
      { key: "pazarama_api_key", label: "API Key" },
      { key: "pazarama_api_secret", label: "API Secret", type: "password" },
    ],
  },
];

export default function Dashboard() {
  const [tab, setTab] = useState<"setup" | "matching" | "logs">("setup");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedMp, setSelectedMp] = useState<Marketplace | null>(null);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; error?: string } | null>(null);

  // Matching state
  const [matchings, setMatchings] = useState<Matching[]>([]);
  const [shopifyProducts, setShopifyProducts] = useState<ShopifyProduct[]>([]);
  const [mpProducts, setMpProducts] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoMatchResult, setAutoMatchResult] = useState<{ matched: number; unmatched: number } | null>(null);

  // Manual match state
  const [selectedShopify, setSelectedShopify] = useState<{ product: ShopifyProduct; variant: ShopifyVariant } | null>(null);
  const [selectedMarketplace, setSelectedMarketplace] = useState<{ product: MarketplaceProduct; variant: MarketplaceVariant } | null>(null);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setSettings).catch(console.error);
  }, []);

  const loadMatchings = useCallback(async () => {
    if (!settings?.shop.marketplace) return;
    const r = await fetch(`/api/matching?marketplace=${settings.shop.marketplace}`);
    const data = await r.json();
    setMatchings(data.matchings || []);
  }, [settings?.shop.marketplace]);

  const loadProducts = useCallback(async () => {
    if (!settings?.shop.marketplace) return;
    setLoading(true);
    try {
      // Fetch Shopify products
      await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "shopify" }) });
      const spRes = await fetch("/api/products?source=shopify");
      const spData = await spRes.json();
      setShopifyProducts(spData.products || []);

      // Fetch marketplace products
      const mp = settings.shop.marketplace;
      let page = 0;
      let hasMore = true;
      while (hasMore) {
        const r = await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: mp, page }) });
        const d = await r.json();
        hasMore = d.hasMore;
        page++;
      }
      const mpRes = await fetch(`/api/products?source=${mp}`);
      const mpData = await mpRes.json();
      setMpProducts(mpData.products || []);
    } finally {
      setLoading(false);
    }
  }, [settings?.shop.marketplace]);

  useEffect(() => {
    if (tab === "matching") {
      loadMatchings();
      loadProducts();
    }
  }, [tab, loadMatchings, loadProducts]);

  const saveCredentials = async () => {
    if (!selectedMp) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const r = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketplace: selectedMp, credentials: creds }),
      });
      const data = await r.json();
      setSaveResult(data);
      if (data.success) {
        const s = await fetch("/api/settings").then((r) => r.json());
        setSettings(s);
      }
    } finally {
      setSaving(false);
    }
  };

  const runAutoMatch = async () => {
    if (!settings?.shop.marketplace) return;
    setLoading(true);
    try {
      const r = await fetch("/api/matching/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketplace: settings.shop.marketplace }),
      });
      const data = await r.json();
      setAutoMatchResult(data);
      await loadMatchings();
    } finally {
      setLoading(false);
    }
  };

  const createManualMatch = async () => {
    if (!selectedShopify || !selectedMarketplace || !settings?.shop.marketplace) return;
    await fetch("/api/matching", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplace: settings.shop.marketplace,
        shopifyProductId: selectedShopify.product.shopifyProductId,
        shopifyVariantId: selectedShopify.variant.id,
        shopifySku: selectedShopify.variant.sku,
        shopifyBarcode: selectedShopify.variant.barcode,
        shopifyInventoryItemId: selectedShopify.variant.inventoryItemId,
        shopifyTitle: `${selectedShopify.product.title} - ${selectedShopify.variant.title}`,
        marketplaceProductId: selectedMarketplace.product.externalProductId,
        marketplaceVariantId: selectedMarketplace.variant.id,
        marketplaceSku: selectedMarketplace.variant.sku,
        marketplaceBarcode: selectedMarketplace.variant.barcode,
        marketplaceTitle: `${selectedMarketplace.product.title} - ${selectedMarketplace.variant.title}`,
      }),
    });
    setSelectedShopify(null);
    setSelectedMarketplace(null);
    await loadMatchings();
  };

  const removeMatch = async (id: number) => {
    await fetch(`/api/matching?id=${id}`, { method: "DELETE" });
    await loadMatchings();
  };

  if (!settings) return <div className="flex items-center justify-center h-screen"><div className="text-gray-500">Yükleniyor...</div></div>;

  const activeMp = settings.marketplaces.find((m) => m.isActive);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">BayiPortal Entegrasyon</h1>
            <p className="text-sm text-gray-500">{settings.shop.domain}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
              {settings.shop.plan === "free" ? "Ücretsiz" : settings.shop.plan} — {matchings.filter((m) => m.isActive).length}/{settings.shop.productLimit} ürün
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto px-6 mt-6">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {[
            { id: "setup" as const, label: "Kurulum" },
            { id: "matching" as const, label: "Ürün Eşleştirme" },
            { id: "logs" as const, label: "Sync Logları" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                tab === t.id ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* SETUP TAB */}
        {tab === "setup" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border p-6">
              <h2 className="text-lg font-semibold mb-4">Pazaryeri Bağlantısı</h2>
              <p className="text-sm text-gray-500 mb-6">
                {settings.shop.plan === "free"
                  ? "Ücretsiz planda 1 pazaryeri, 10 ürüne kadar entegrasyon yapabilirsiniz."
                  : "Pazaryeri bilgilerinizi girin ve bağlantıyı test edin."}
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {MARKETPLACES.map((mp) => {
                  const configured = settings.marketplaces.find((m) => m.marketplace === mp.id);
                  return (
                    <button
                      key={mp.id}
                      onClick={() => { setSelectedMp(mp.id); setCreds({}); setSaveResult(null); }}
                      className={`p-4 rounded-lg border-2 text-center transition ${
                        selectedMp === mp.id
                          ? "border-blue-500 bg-blue-50"
                          : configured?.isActive
                          ? "border-green-300 bg-green-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="font-semibold text-sm">{mp.name}</div>
                      {configured?.isActive && (
                        <div className="text-xs text-green-600 mt-1">Bağlı</div>
                      )}
                    </button>
                  );
                })}
              </div>

              {selectedMp && (
                <div className="border-t pt-6">
                  <h3 className="font-medium mb-4">{MARKETPLACES.find((m) => m.id === selectedMp)?.name} Ayarları</h3>
                  <div className="space-y-4 max-w-md">
                    {MARKETPLACES.find((m) => m.id === selectedMp)?.fields.map((field) => (
                      <div key={field.key}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                        <input
                          type={field.type || "text"}
                          value={creds[field.key] || ""}
                          onChange={(e) => setCreds({ ...creds, [field.key]: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    ))}
                    <button
                      onClick={saveCredentials}
                      disabled={saving}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving ? "Test ediliyor..." : "Kaydet ve Test Et"}
                    </button>
                    {saveResult && (
                      <div className={`p-3 rounded-lg text-sm ${saveResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                        {saveResult.success ? "Bağlantı başarılı!" : `Hata: ${saveResult.error}`}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MATCHING TAB */}
        {tab === "matching" && (
          <div className="space-y-6">
            {!activeMp ? (
              <div className="bg-white rounded-xl border p-8 text-center">
                <p className="text-gray-500">Önce Kurulum sekmesinden bir pazaryeri bağlayın.</p>
              </div>
            ) : (
              <>
                {/* Auto match */}
                <div className="bg-white rounded-xl border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-semibold">Otomatik Eşleştirme</h2>
                      <p className="text-sm text-gray-500">Barkod ve SKU eşleşen ürünler otomatik eşleştirilir.</p>
                    </div>
                    <button
                      onClick={runAutoMatch}
                      disabled={loading}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      {loading ? "Eşleştiriliyor..." : "Otomatik Eşleştir"}
                    </button>
                  </div>
                  {autoMatchResult && (
                    <div className="p-3 bg-blue-50 text-blue-700 rounded-lg text-sm">
                      {autoMatchResult.matched} ürün eşleştirildi, {autoMatchResult.unmatched} ürün eşleşmedi.
                    </div>
                  )}
                </div>

                {/* Current matchings */}
                <div className="bg-white rounded-xl border p-6">
                  <h2 className="text-lg font-semibold mb-4">
                    Eşleştirilmiş Ürünler ({matchings.filter((m) => m.isActive).length}/{settings.shop.productLimit})
                  </h2>
                  {matchings.filter((m) => m.isActive).length === 0 ? (
                    <p className="text-gray-500 text-sm">Henüz eşleştirme yok. Otomatik eşleştirmeyi deneyin veya manuel eşleştirin.</p>
                  ) : (
                    <div className="space-y-2">
                      {matchings.filter((m) => m.isActive).map((m) => (
                        <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex-1">
                            <div className="text-sm font-medium">{m.shopifyTitle || "Shopify Ürün"}</div>
                            <div className="text-xs text-gray-500">
                              {m.shopifyBarcode && `Barkod: ${m.shopifyBarcode}`}
                              {m.shopifySku && ` | SKU: ${m.shopifySku}`}
                            </div>
                          </div>
                          <div className="px-3 text-gray-400">↔</div>
                          <div className="flex-1">
                            <div className="text-sm font-medium">{m.marketplaceTitle || "Pazaryeri Ürün"}</div>
                            <div className="text-xs text-gray-500">
                              {m.marketplaceBarcode && `Barkod: ${m.marketplaceBarcode}`}
                              {` | ${m.matchType}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            {m.lastSyncStatus === "success" && <span className="w-2 h-2 rounded-full bg-green-500" />}
                            {m.lastSyncStatus === "error" && <span className="w-2 h-2 rounded-full bg-red-500" />}
                            <button onClick={() => removeMatch(m.id)} className="text-red-500 hover:text-red-700 text-xs">Kaldır</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Manual match */}
                <div className="bg-white rounded-xl border p-6">
                  <h2 className="text-lg font-semibold mb-4">Manuel Eşleştirme</h2>
                  <div className="grid grid-cols-2 gap-6">
                    {/* Shopify side */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-2">Shopify Ürünleri</h3>
                      <div className="max-h-96 overflow-y-auto space-y-1 border rounded-lg p-2">
                        {shopifyProducts.map((p) =>
                          (p.variants as unknown as ShopifyVariant[]).map((v) => (
                            <button
                              key={`${p.shopifyProductId}-${v.id}`}
                              onClick={() => setSelectedShopify({ product: p, variant: v })}
                              className={`w-full text-left p-2 rounded text-sm ${
                                selectedShopify?.variant.id === v.id ? "bg-blue-100 border-blue-300 border" : "hover:bg-gray-50"
                              }`}
                            >
                              <div className="font-medium truncate">{p.title}</div>
                              <div className="text-xs text-gray-500">
                                {v.title} | {v.barcode || "Barkod yok"} | Stok: {v.inventory_quantity}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                    {/* Marketplace side */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-2">Pazaryeri Ürünleri</h3>
                      <div className="max-h-96 overflow-y-auto space-y-1 border rounded-lg p-2">
                        {mpProducts.map((p) =>
                          (p.variants as unknown as MarketplaceVariant[]).map((v) => (
                            <button
                              key={`${p.externalProductId}-${v.id}`}
                              onClick={() => setSelectedMarketplace({ product: p, variant: v })}
                              className={`w-full text-left p-2 rounded text-sm ${
                                selectedMarketplace?.variant.id === v.id ? "bg-green-100 border-green-300 border" : "hover:bg-gray-50"
                              }`}
                            >
                              <div className="font-medium truncate">{p.title}</div>
                              <div className="text-xs text-gray-500">
                                {v.title} | {v.barcode || "Barkod yok"} | Stok: {v.stockQuantity}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                  {selectedShopify && selectedMarketplace && (
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg flex items-center justify-between">
                      <span className="text-sm">
                        <strong>{selectedShopify.product.title}</strong> ↔ <strong>{selectedMarketplace.product.title}</strong>
                      </span>
                      <button onClick={createManualMatch} className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-medium">
                        Eşleştir
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* LOGS TAB */}
        {tab === "logs" && (
          <div className="bg-white rounded-xl border p-6">
            <h2 className="text-lg font-semibold mb-4">Sync Logları</h2>
            <p className="text-sm text-gray-500">Son sync işlemleri burada görünecek.</p>
            {/* TODO: Fetch and display sync logs */}
          </div>
        )}
      </div>
    </div>
  );
}
