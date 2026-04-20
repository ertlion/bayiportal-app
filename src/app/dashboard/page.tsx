"use client";

import { useState, useEffect, useCallback } from "react";

type Marketplace = "trendyol" | "hepsiburada" | "n11" | "pazarama";
type InvoiceProvider = "uyumsoft" | "parasut" | "logo" | "elogo" | "kolaybi";

interface InvoiceItem {
  name: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  totalPrice: number;
}

interface Invoice {
  id: number;
  provider: string;
  externalInvoiceId: string | null;
  orderNumber: string;
  orderSource: string | null;
  customerName: string | null;
  totalAmount: string;
  currency: string;
  status: string;
  errorMessage: string | null;
  pdfUrl: string | null;
  createdAt: string;
}

interface InvoiceSettingsData {
  configured: boolean;
  provider?: InvoiceProvider;
  isActive?: boolean;
  autoInvoice?: boolean;
  lastTestedAt?: string;
  testResult?: string;
}

const INVOICE_PROVIDERS: { id: InvoiceProvider; name: string; fields: { key: string; label: string; type?: string }[] }[] = [
  {
    id: "uyumsoft",
    name: "Uyumsoft",
    fields: [
      { key: "uyumsoft_username", label: "Kullanici Adi" },
      { key: "uyumsoft_password", label: "Sifre", type: "password" },
      { key: "uyumsoft_is_test", label: "Test Modu (true/false)" },
      { key: "uyumsoft_vkn", label: "VKN / TCKN" },
      { key: "uyumsoft_company_name", label: "Firma Adi" },
      { key: "uyumsoft_address", label: "Adres" },
      { key: "uyumsoft_city", label: "Sehir" },
    ],
  },
  {
    id: "parasut",
    name: "Parasut",
    fields: [
      { key: "parasut_client_id", label: "Client ID" },
      { key: "parasut_client_secret", label: "Client Secret", type: "password" },
      { key: "parasut_company_id", label: "Sirket ID" },
      { key: "parasut_username", label: "Kullanici Adi" },
      { key: "parasut_password", label: "Sifre", type: "password" },
    ],
  },
  {
    id: "logo",
    name: "Logo",
    fields: [
      { key: "logo_username", label: "Kullanici Adi" },
      { key: "logo_password", label: "Sifre", type: "password" },
      { key: "logo_firm_id", label: "Firma ID" },
    ],
  },
  {
    id: "elogo",
    name: "e-Logo",
    fields: [
      { key: "elogo_api_key", label: "API Key" },
      { key: "elogo_secret_key", label: "Secret Key", type: "password" },
    ],
  },
  {
    id: "kolaybi",
    name: "KolayBi",
    fields: [
      { key: "kolaybi_api_key", label: "API Key", type: "password" },
    ],
  },
];

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
  const [tab, setTab] = useState<"setup" | "matching" | "logs" | "invoice">("setup");
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

  // Invoice state
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettingsData | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<InvoiceProvider | null>(null);
  const [invoiceCreds, setInvoiceCreds] = useState<Record<string, string>>({});
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [invoiceSaveResult, setInvoiceSaveResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [invoiceList, setInvoiceList] = useState<Invoice[]>([]);
  const [autoInvoice, setAutoInvoice] = useState(false);

  // Invoice form state
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    orderNumber: "",
    orderSource: "",
    customerName: "",
    customerTaxId: "",
    customerTaxOffice: "",
    customerAddress: "",
    customerCity: "",
    totalAmount: "",
    itemName: "",
    itemQuantity: "1",
    itemUnitPrice: "",
    itemVatRate: "20",
  });
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [creatingInvoice, setCreatingInvoice] = useState(false);

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

  const loadInvoiceData = useCallback(async () => {
    try {
      const [settingsRes, listRes] = await Promise.all([
        fetch("/api/invoices/settings").then((r) => r.json()),
        fetch("/api/invoices").then((r) => r.json()),
      ]);
      setInvoiceSettings(settingsRes);
      setInvoiceList(listRes.invoices || []);
      if (settingsRes.configured && settingsRes.provider) {
        setSelectedProvider(settingsRes.provider);
        setAutoInvoice(settingsRes.autoInvoice || false);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (tab === "matching") {
      loadMatchings();
      loadProducts();
    }
    if (tab === "invoice") {
      loadInvoiceData();
    }
  }, [tab, loadMatchings, loadProducts, loadInvoiceData]);

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

  const saveInvoiceSettings = async () => {
    if (!selectedProvider) return;
    setInvoiceSaving(true);
    setInvoiceSaveResult(null);
    try {
      const r = await fetch("/api/invoices/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selectedProvider, credentials: invoiceCreds, autoInvoice }),
      });
      const data = await r.json();
      setInvoiceSaveResult(data);
      if (data.success) {
        await loadInvoiceData();
      }
    } finally {
      setInvoiceSaving(false);
    }
  };

  const addInvoiceItem = () => {
    const qty = parseFloat(invoiceForm.itemQuantity) || 1;
    const price = parseFloat(invoiceForm.itemUnitPrice) || 0;
    const vat = parseFloat(invoiceForm.itemVatRate) || 0;
    if (!invoiceForm.itemName || price <= 0) return;
    const totalPrice = Math.round(qty * price * (1 + vat / 100) * 100) / 100;
    setInvoiceItems([...invoiceItems, {
      name: invoiceForm.itemName,
      quantity: qty,
      unitPrice: price,
      vatRate: vat,
      totalPrice,
    }]);
    setInvoiceForm({ ...invoiceForm, itemName: "", itemQuantity: "1", itemUnitPrice: "", itemVatRate: "20" });
  };

  const removeInvoiceItem = (idx: number) => {
    setInvoiceItems(invoiceItems.filter((_, i) => i !== idx));
  };

  const createInvoice = async () => {
    if (!invoiceForm.orderNumber || !invoiceForm.customerName || invoiceItems.length === 0) return;
    setCreatingInvoice(true);
    try {
      const totalAmount = parseFloat(invoiceForm.totalAmount) || invoiceItems.reduce((sum, i) => sum + i.totalPrice, 0);
      const r = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber: invoiceForm.orderNumber,
          orderSource: invoiceForm.orderSource || undefined,
          customerName: invoiceForm.customerName,
          customerTaxId: invoiceForm.customerTaxId || undefined,
          customerTaxOffice: invoiceForm.customerTaxOffice || undefined,
          customerAddress: invoiceForm.customerAddress || undefined,
          customerCity: invoiceForm.customerCity || undefined,
          items: invoiceItems,
          totalAmount,
        }),
      });
      const data = await r.json();
      if (data.success) {
        setShowInvoiceForm(false);
        setInvoiceForm({ orderNumber: "", orderSource: "", customerName: "", customerTaxId: "", customerTaxOffice: "", customerAddress: "", customerCity: "", totalAmount: "", itemName: "", itemQuantity: "1", itemUnitPrice: "", itemVatRate: "20" });
        setInvoiceItems([]);
        await loadInvoiceData();
      } else {
        alert(data.error || "Fatura olusturulamadi");
      }
    } finally {
      setCreatingInvoice(false);
    }
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
            { id: "invoice" as const, label: "E-Fatura" },
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

        {/* INVOICE TAB */}
        {tab === "invoice" && (
          <div className="space-y-6">
            {/* Provider Selection & Settings */}
            <div className="bg-white rounded-xl border p-6">
              <h2 className="text-lg font-semibold mb-4">E-Fatura Entegrasyonu</h2>
              <p className="text-sm text-gray-500 mb-6">
                Fatura saglayicinizi secin ve bilgilerinizi girin.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                {INVOICE_PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedProvider(p.id); setInvoiceCreds({}); setInvoiceSaveResult(null); }}
                    className={`p-4 rounded-lg border-2 text-center transition ${
                      selectedProvider === p.id
                        ? "border-blue-500 bg-blue-50"
                        : invoiceSettings?.configured && invoiceSettings.provider === p.id
                        ? "border-green-300 bg-green-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="font-semibold text-sm">{p.name}</div>
                    {invoiceSettings?.configured && invoiceSettings.provider === p.id && (
                      <div className="text-xs text-green-600 mt-1">Aktif</div>
                    )}
                  </button>
                ))}
              </div>

              {selectedProvider && (
                <div className="border-t pt-6">
                  <h3 className="font-medium mb-4">{INVOICE_PROVIDERS.find((p) => p.id === selectedProvider)?.name} Ayarlari</h3>
                  <div className="space-y-4 max-w-md">
                    {INVOICE_PROVIDERS.find((p) => p.id === selectedProvider)?.fields.map((field) => (
                      <div key={field.key}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                        <input
                          type={field.type || "text"}
                          value={invoiceCreds[field.key] || ""}
                          onChange={(e) => setInvoiceCreds({ ...invoiceCreds, [field.key]: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    ))}
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={autoInvoice}
                          onChange={(e) => setAutoInvoice(e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        Siparislerde otomatik fatura olustur
                      </label>
                    </div>
                    <button
                      onClick={saveInvoiceSettings}
                      disabled={invoiceSaving}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {invoiceSaving ? "Test ediliyor..." : "Kaydet ve Test Et"}
                    </button>
                    {invoiceSaveResult && (
                      <div className={`p-3 rounded-lg text-sm ${invoiceSaveResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                        {invoiceSaveResult.success ? "Baglanti basarili!" : `Hata: ${invoiceSaveResult.error}`}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Create Invoice */}
            {invoiceSettings?.configured && invoiceSettings.isActive && (
              <div className="bg-white rounded-xl border p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Manuel Fatura Olustur</h2>
                  <button
                    onClick={() => setShowInvoiceForm(!showInvoiceForm)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                  >
                    {showInvoiceForm ? "Kapat" : "Yeni Fatura"}
                  </button>
                </div>

                {showInvoiceForm && (
                  <div className="border-t pt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Siparis No *</label>
                        <input
                          type="text"
                          value={invoiceForm.orderNumber}
                          onChange={(e) => setInvoiceForm({ ...invoiceForm, orderNumber: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Siparis Kaynagi</label>
                        <select
                          value={invoiceForm.orderSource}
                          onChange={(e) => setInvoiceForm({ ...invoiceForm, orderSource: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                        >
                          <option value="">Seciniz</option>
                          <option value="shopify">Shopify</option>
                          <option value="trendyol">Trendyol</option>
                          <option value="hepsiburada">Hepsiburada</option>
                          <option value="n11">N11</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Musteri Adi *</label>
                        <input
                          type="text"
                          value={invoiceForm.customerName}
                          onChange={(e) => setInvoiceForm({ ...invoiceForm, customerName: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">VKN / TCKN</label>
                        <input
                          type="text"
                          value={invoiceForm.customerTaxId}
                          onChange={(e) => setInvoiceForm({ ...invoiceForm, customerTaxId: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Vergi Dairesi</label>
                        <input
                          type="text"
                          value={invoiceForm.customerTaxOffice}
                          onChange={(e) => setInvoiceForm({ ...invoiceForm, customerTaxOffice: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Adres</label>
                        <input
                          type="text"
                          value={invoiceForm.customerAddress}
                          onChange={(e) => setInvoiceForm({ ...invoiceForm, customerAddress: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Sehir</label>
                        <input
                          type="text"
                          value={invoiceForm.customerCity}
                          onChange={(e) => setInvoiceForm({ ...invoiceForm, customerCity: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                        />
                      </div>
                    </div>

                    {/* Invoice Items */}
                    <div className="border-t pt-4">
                      <h3 className="text-sm font-medium text-gray-700 mb-3">Fatura Kalemleri</h3>
                      {invoiceItems.length > 0 && (
                        <div className="space-y-2 mb-4">
                          {invoiceItems.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                              <span className="flex-1">{item.name}</span>
                              <span className="w-16 text-center">{item.quantity} ad.</span>
                              <span className="w-24 text-right">{item.unitPrice.toFixed(2)} TL</span>
                              <span className="w-16 text-center">%{item.vatRate}</span>
                              <span className="w-24 text-right font-medium">{item.totalPrice.toFixed(2)} TL</span>
                              <button onClick={() => removeInvoiceItem(idx)} className="ml-2 text-red-500 hover:text-red-700 text-xs">Sil</button>
                            </div>
                          ))}
                          <div className="text-right text-sm font-semibold">
                            Toplam: {invoiceItems.reduce((s, i) => s + i.totalPrice, 0).toFixed(2)} TL
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <label className="block text-xs text-gray-500 mb-1">Urun Adi</label>
                          <input
                            type="text"
                            value={invoiceForm.itemName}
                            onChange={(e) => setInvoiceForm({ ...invoiceForm, itemName: e.target.value })}
                            className="w-full px-2 py-1.5 border rounded text-sm"
                          />
                        </div>
                        <div className="w-20">
                          <label className="block text-xs text-gray-500 mb-1">Adet</label>
                          <input
                            type="number"
                            value={invoiceForm.itemQuantity}
                            onChange={(e) => setInvoiceForm({ ...invoiceForm, itemQuantity: e.target.value })}
                            className="w-full px-2 py-1.5 border rounded text-sm"
                          />
                        </div>
                        <div className="w-28">
                          <label className="block text-xs text-gray-500 mb-1">Birim Fiyat</label>
                          <input
                            type="number"
                            step="0.01"
                            value={invoiceForm.itemUnitPrice}
                            onChange={(e) => setInvoiceForm({ ...invoiceForm, itemUnitPrice: e.target.value })}
                            className="w-full px-2 py-1.5 border rounded text-sm"
                          />
                        </div>
                        <div className="w-20">
                          <label className="block text-xs text-gray-500 mb-1">KDV %</label>
                          <input
                            type="number"
                            value={invoiceForm.itemVatRate}
                            onChange={(e) => setInvoiceForm({ ...invoiceForm, itemVatRate: e.target.value })}
                            className="w-full px-2 py-1.5 border rounded text-sm"
                          />
                        </div>
                        <button
                          onClick={addInvoiceItem}
                          className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                        >
                          Ekle
                        </button>
                      </div>
                    </div>

                    <div className="border-t pt-4 flex justify-end">
                      <button
                        onClick={createInvoice}
                        disabled={creatingInvoice || invoiceItems.length === 0 || !invoiceForm.orderNumber || !invoiceForm.customerName}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                      >
                        {creatingInvoice ? "Gonderiliyor..." : "Fatura Olustur"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Invoice List */}
            <div className="bg-white rounded-xl border p-6">
              <h2 className="text-lg font-semibold mb-4">Kesilen Faturalar</h2>
              {invoiceList.length === 0 ? (
                <p className="text-gray-500 text-sm">Henuz fatura kesilmemis.</p>
              ) : (
                <div className="space-y-2">
                  {invoiceList.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <div className="text-sm font-medium">#{inv.orderNumber}</div>
                        <div className="text-xs text-gray-500">
                          {inv.customerName} {inv.orderSource ? `(${inv.orderSource})` : ""}
                        </div>
                      </div>
                      <div className="text-right mr-4">
                        <div className="text-sm font-medium">{inv.totalAmount} {inv.currency}</div>
                        <div className="text-xs text-gray-500">{new Date(inv.createdAt).toLocaleDateString("tr-TR")}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          inv.status === "sent" ? "bg-green-100 text-green-700" :
                          inv.status === "error" ? "bg-red-100 text-red-700" :
                          inv.status === "cancelled" ? "bg-gray-100 text-gray-700" :
                          "bg-yellow-100 text-yellow-700"
                        }`}>
                          {inv.status === "sent" ? "Gonderildi" :
                           inv.status === "error" ? "Hata" :
                           inv.status === "cancelled" ? "Iptal" : "Bekliyor"}
                        </span>
                        {inv.pdfUrl && (
                          <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-xs">
                            PDF
                          </a>
                        )}
                      </div>
                      {inv.errorMessage && (
                        <div className="text-xs text-red-500 ml-2" title={inv.errorMessage}>
                          {inv.errorMessage.substring(0, 30)}...
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
