"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Tabs,
  FormLayout,
  TextField,
  Select,
  Button,
  Banner,
  DataTable,
  Badge,
  Modal,
  EmptyState,
  Spinner,
  Checkbox,
  Text,
  BlockStack,
  InlineStack,
  InlineGrid,
  Box,
  Divider,
} from "@shopify/polaris";
import { useAuthenticatedFetch } from "../providers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  shop: {
    domain: string;
    plan: string;
    productLimit: number;
    marketplace: string | null;
  };
  marketplaces: Array<{
    marketplace: string;
    isActive: boolean;
    testResult: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MARKETPLACES: {
  id: Marketplace;
  name: string;
  fields: { key: string; label: string; type?: string }[];
}[] = [
  {
    id: "trendyol",
    name: "Trendyol",
    fields: [
      { key: "trendyol_api_key", label: "API Key" },
      { key: "trendyol_api_secret", label: "API Secret", type: "password" },
      { key: "trendyol_seller_id", label: "Satici ID" },
    ],
  },
  {
    id: "hepsiburada",
    name: "Hepsiburada",
    fields: [
      { key: "hb_merchant_id", label: "Magaza ID (Merchant ID)" },
      { key: "hb_password", label: "Servis Sifresi", type: "password" },
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

const INVOICE_PROVIDERS: {
  id: InvoiceProvider;
  name: string;
  fields: { key: string; label: string; type?: string }[];
}[] = [
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
    fields: [{ key: "kolaybi_api_key", label: "API Key", type: "password" }],
  },
];

const TAB_IDS = ["setup", "matching", "logs", "invoice"] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function invoiceStatusBadge(status: string) {
  switch (status) {
    case "sent":
      return <Badge tone="success">Gonderildi</Badge>;
    case "error":
      return <Badge tone="critical">Hata</Badge>;
    case "cancelled":
      return <Badge>Iptal</Badge>;
    default:
      return <Badge tone="warning">Bekliyor</Badge>;
  }
}

function syncStatusBadge(status: string | null) {
  if (status === "success") return <Badge tone="success">Basarili</Badge>;
  if (status === "error") return <Badge tone="critical">Hata</Badge>;
  return <Badge>Bekleniyor</Badge>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const authFetch = useAuthenticatedFetch();

  // Tab state
  const [selectedTab, setSelectedTab] = useState(0);

  // Settings state
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedMp, setSelectedMp] = useState<Marketplace | null>(null);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);

  // Matching state
  const [matchings, setMatchings] = useState<Matching[]>([]);
  const [shopifyProducts, setShopifyProducts] = useState<ShopifyProduct[]>([]);
  const [mpProducts, setMpProducts] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoMatchResult, setAutoMatchResult] = useState<{
    matched: number;
    unmatched: number;
  } | null>(null);

  // Manual match state
  const [selectedShopify, setSelectedShopify] = useState<{
    product: ShopifyProduct;
    variant: ShopifyVariant;
  } | null>(null);
  const [selectedMarketplace, setSelectedMarketplace] = useState<{
    product: MarketplaceProduct;
    variant: MarketplaceVariant;
  } | null>(null);

  // Invoice state
  const [invoiceSettings, setInvoiceSettings] =
    useState<InvoiceSettingsData | null>(null);
  const [selectedProvider, setSelectedProvider] =
    useState<InvoiceProvider | null>(null);
  const [invoiceCreds, setInvoiceCreds] = useState<Record<string, string>>({});
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [invoiceSaveResult, setInvoiceSaveResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);
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

  // -----------------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------------

  useEffect(() => {
    authFetch("/api/settings")
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => {});
  }, [authFetch]);

  const loadMatchings = useCallback(async () => {
    if (!settings?.shop.marketplace) return;
    const r = await authFetch(
      `/api/matching?marketplace=${settings.shop.marketplace}`,
    );
    const data = await r.json();
    setMatchings(data.matchings || []);
  }, [authFetch, settings?.shop.marketplace]);

  const loadProducts = useCallback(async () => {
    if (!settings?.shop.marketplace) return;
    setLoading(true);
    try {
      await authFetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "shopify" }),
      });
      const spRes = await authFetch("/api/products?source=shopify");
      const spData = await spRes.json();
      setShopifyProducts(spData.products || []);

      const mp = settings.shop.marketplace;
      let page = 0;
      let hasMore = true;
      while (hasMore) {
        const r = await authFetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: mp, page }),
        });
        const d = await r.json();
        hasMore = d.hasMore;
        page++;
      }
      const mpRes = await authFetch(`/api/products?source=${mp}`);
      const mpData = await mpRes.json();
      setMpProducts(mpData.products || []);
    } finally {
      setLoading(false);
    }
  }, [authFetch, settings?.shop.marketplace]);

  const loadInvoiceData = useCallback(async () => {
    try {
      const [settingsRes, listRes] = await Promise.all([
        authFetch("/api/invoices/settings").then((r) => r.json()),
        authFetch("/api/invoices").then((r) => r.json()),
      ]);
      setInvoiceSettings(settingsRes);
      setInvoiceList(listRes.invoices || []);
      if (settingsRes.configured && settingsRes.provider) {
        setSelectedProvider(settingsRes.provider);
        setAutoInvoice(settingsRes.autoInvoice || false);
      }
    } catch {
      /* ignore */
    }
  }, [authFetch]);

  useEffect(() => {
    const currentTab = TAB_IDS[selectedTab];
    if (currentTab === "matching") {
      loadMatchings();
      loadProducts();
    }
    if (currentTab === "invoice") {
      loadInvoiceData();
    }
  }, [selectedTab, loadMatchings, loadProducts, loadInvoiceData]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const saveCredentials = async () => {
    if (!selectedMp) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const r = await authFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketplace: selectedMp, credentials: creds }),
      });
      const data = await r.json();
      setSaveResult(data);
      if (data.success) {
        const s = await authFetch("/api/settings").then((res) => res.json());
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
      const r = await authFetch("/api/matching/auto", {
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
    if (
      !selectedShopify ||
      !selectedMarketplace ||
      !settings?.shop.marketplace
    )
      return;
    await authFetch("/api/matching", {
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
    await authFetch(`/api/matching?id=${id}`, { method: "DELETE" });
    await loadMatchings();
  };

  const saveInvoiceSettings = async () => {
    if (!selectedProvider) return;
    setInvoiceSaving(true);
    setInvoiceSaveResult(null);
    try {
      const r = await authFetch("/api/invoices/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedProvider,
          credentials: invoiceCreds,
          autoInvoice,
        }),
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
    const totalPrice =
      Math.round(qty * price * (1 + vat / 100) * 100) / 100;
    setInvoiceItems([
      ...invoiceItems,
      {
        name: invoiceForm.itemName,
        quantity: qty,
        unitPrice: price,
        vatRate: vat,
        totalPrice,
      },
    ]);
    setInvoiceForm({
      ...invoiceForm,
      itemName: "",
      itemQuantity: "1",
      itemUnitPrice: "",
      itemVatRate: "20",
    });
  };

  const removeInvoiceItem = (idx: number) => {
    setInvoiceItems(invoiceItems.filter((_, i) => i !== idx));
  };

  const createInvoice = async () => {
    if (
      !invoiceForm.orderNumber ||
      !invoiceForm.customerName ||
      invoiceItems.length === 0
    )
      return;
    setCreatingInvoice(true);
    try {
      const totalAmount =
        parseFloat(invoiceForm.totalAmount) ||
        invoiceItems.reduce((sum, i) => sum + i.totalPrice, 0);
      const r = await authFetch("/api/invoices", {
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
        setInvoiceForm({
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
        setInvoiceItems([]);
        await loadInvoiceData();
      }
    } finally {
      setCreatingInvoice(false);
    }
  };

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  if (!settings) {
    return (
      <Page title="BayiPortal Entegrasyon">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack align="center" inlineAlign="center">
                <Spinner size="large" />
                <Text as="p" variant="bodyMd">
                  Yukleniyor...
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const activeMp = settings.marketplaces.find((m) => m.isActive);
  const activeMatchCount = matchings.filter((m) => m.isActive).length;

  // -----------------------------------------------------------------------
  // Tab content renderers
  // -----------------------------------------------------------------------

  const renderSetupTab = () => (
    <Layout>
      <Layout.Section>
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Pazaryeri Baglantisi
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              {settings.shop.plan === "free"
                ? "Ucretsiz planda 1 pazaryeri, 10 urune kadar entegrasyon yapabilirsiniz."
                : "Pazaryeri bilgilerinizi girin ve baglantiyi test edin."}
            </Text>

            <InlineGrid columns={{ xs: 2, md: 4 }} gap="300">
              {MARKETPLACES.map((mp) => {
                const configured = settings.marketplaces.find(
                  (m) => m.marketplace === mp.id,
                );
                const isSelected = selectedMp === mp.id;
                return (
                  <Box
                    key={mp.id}
                    padding="400"
                    borderWidth="025"
                    borderColor={
                      isSelected
                        ? "border-info"
                        : configured?.isActive
                          ? "border-success"
                          : "border"
                    }
                    borderRadius="200"
                    background={
                      isSelected
                        ? "bg-surface-info"
                        : configured?.isActive
                          ? "bg-surface-success"
                          : "bg-surface"
                    }
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMp(mp.id);
                        setCreds({});
                        setSaveResult(null);
                      }}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        display: "block",
                        width: "100%",
                        textAlign: "center",
                      }}
                    >
                      <BlockStack gap="100" align="center" inlineAlign="center">
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {mp.name}
                        </Text>
                        {configured?.isActive && (
                          <Badge tone="success">Bagli</Badge>
                        )}
                      </BlockStack>
                    </button>
                  </Box>
                );
              })}
            </InlineGrid>

            {selectedMp && (
              <>
                <Divider />
                <Text as="h3" variant="headingSm">
                  {MARKETPLACES.find((m) => m.id === selectedMp)?.name} Ayarlari
                </Text>
                <FormLayout>
                  {MARKETPLACES.find((m) => m.id === selectedMp)?.fields.map(
                    (field) => (
                      <TextField
                        key={field.key}
                        label={field.label}
                        type={field.type === "password" ? "password" : "text"}
                        value={creds[field.key] || ""}
                        onChange={(val) =>
                          setCreds({ ...creds, [field.key]: val })
                        }
                        autoComplete="off"
                      />
                    ),
                  )}
                  <Button
                    variant="primary"
                    onClick={saveCredentials}
                    loading={saving}
                  >
                    Kaydet ve Test Et
                  </Button>
                </FormLayout>
                {saveResult && (
                  <Banner
                    title={
                      saveResult.success
                        ? "Baglanti basarili!"
                        : `Hata: ${saveResult.error}`
                    }
                    tone={saveResult.success ? "success" : "critical"}
                    onDismiss={() => setSaveResult(null)}
                  />
                )}
              </>
            )}
          </BlockStack>
        </Card>
      </Layout.Section>
    </Layout>
  );

  const renderMatchingTab = () => {
    if (!activeMp) {
      return (
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="Pazaryeri baglantisi gerekli"
                image=""
              >
                <p>
                  Once Kurulum sekmesinden bir pazaryeri baglayin.
                </p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      );
    }

    const activeMatchings = matchings.filter((m) => m.isActive);

    return (
      <Layout>
        {/* Auto match */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Otomatik Eslestirme
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Barkod ve SKU eslesen urunler otomatik eslestirilir.
                  </Text>
                </BlockStack>
                <Button
                  variant="primary"
                  onClick={runAutoMatch}
                  loading={loading}
                >
                  Otomatik Eslestir
                </Button>
              </InlineStack>
              {autoMatchResult && (
                <Banner
                  title={`${autoMatchResult.matched} urun eslestirildi, ${autoMatchResult.unmatched} urun eslesmedi.`}
                  tone="info"
                  onDismiss={() => setAutoMatchResult(null)}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Current matchings */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Eslestirilmis Urunler ({activeMatchCount}/
                {settings.shop.productLimit})
              </Text>
              {activeMatchings.length === 0 ? (
                <Text as="p" variant="bodyMd" tone="subdued">
                  Henuz eslestirme yok. Otomatik eslestirmeyi deneyin veya
                  manuel eslestirin.
                </Text>
              ) : (
                <DataTable
                  columnContentTypes={[
                    "text",
                    "text",
                    "text",
                    "text",
                    "text",
                  ]}
                  headings={[
                    "Shopify Urun",
                    "Pazaryeri Urun",
                    "Eslesme Tipi",
                    "Durum",
                    "Islem",
                  ]}
                  rows={activeMatchings.map((m) => [
                    m.shopifyTitle || "Shopify Urun",
                    m.marketplaceTitle || "Pazaryeri Urun",
                    m.matchType,
                    syncStatusBadge(m.lastSyncStatus),
                    <Button
                      key={m.id}
                      variant="plain"
                      tone="critical"
                      onClick={() => removeMatch(m.id)}
                    >
                      Kaldir
                    </Button>,
                  ])}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Manual match */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Manuel Eslestirme
              </Text>
              <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                {/* Shopify side */}
                <Card>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                      Shopify Urunleri
                    </Text>
                    <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                      <BlockStack gap="100">
                        {shopifyProducts.map((p) =>
                          (p.variants as unknown as ShopifyVariant[]).map(
                            (v) => {
                              const isSelected =
                                selectedShopify?.variant.id === v.id;
                              return (
                                <Box
                                  key={`${p.shopifyProductId}-${v.id}`}
                                  padding="200"
                                  borderWidth="025"
                                  borderColor={
                                    isSelected ? "border-info" : "border"
                                  }
                                  borderRadius="100"
                                  background={
                                    isSelected
                                      ? "bg-surface-info"
                                      : "bg-surface"
                                  }
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedShopify({
                                        product: p,
                                        variant: v,
                                      })
                                    }
                                    style={{
                                      all: "unset",
                                      cursor: "pointer",
                                      display: "block",
                                      width: "100%",
                                    }}
                                  >
                                    <BlockStack gap="050">
                                      <Text
                                        as="span"
                                        variant="bodyMd"
                                        fontWeight="semibold"
                                        truncate
                                      >
                                        {p.title}
                                      </Text>
                                      <Text
                                        as="span"
                                        variant="bodySm"
                                        tone="subdued"
                                      >
                                        {v.title} |{" "}
                                        {v.barcode || "Barkod yok"} | Stok:{" "}
                                        {v.inventory_quantity}
                                      </Text>
                                    </BlockStack>
                                  </button>
                                </Box>
                              );
                            },
                          ),
                        )}
                      </BlockStack>
                    </div>
                  </BlockStack>
                </Card>

                {/* Marketplace side */}
                <Card>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                      Pazaryeri Urunleri
                    </Text>
                    <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                      <BlockStack gap="100">
                        {mpProducts.map((p) =>
                          (
                            p.variants as unknown as MarketplaceVariant[]
                          ).map((v) => {
                            const isSelected =
                              selectedMarketplace?.variant.id === v.id;
                            return (
                              <Box
                                key={`${p.externalProductId}-${v.id}`}
                                padding="200"
                                borderWidth="025"
                                borderColor={
                                  isSelected ? "border-success" : "border"
                                }
                                borderRadius="100"
                                background={
                                  isSelected
                                    ? "bg-surface-success"
                                    : "bg-surface"
                                }
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedMarketplace({
                                      product: p,
                                      variant: v,
                                    })
                                  }
                                  style={{
                                    all: "unset",
                                    cursor: "pointer",
                                    display: "block",
                                    width: "100%",
                                  }}
                                >
                                  <BlockStack gap="050">
                                    <Text
                                      as="span"
                                      variant="bodyMd"
                                      fontWeight="semibold"
                                      truncate
                                    >
                                      {p.title}
                                    </Text>
                                    <Text
                                      as="span"
                                      variant="bodySm"
                                      tone="subdued"
                                    >
                                      {v.title} |{" "}
                                      {v.barcode || "Barkod yok"} | Stok:{" "}
                                      {v.stockQuantity}
                                    </Text>
                                  </BlockStack>
                                </button>
                              </Box>
                            );
                          }),
                        )}
                      </BlockStack>
                    </div>
                  </BlockStack>
                </Card>
              </InlineGrid>

              {selectedShopify && selectedMarketplace && (
                <Banner
                  title={`${selectedShopify.product.title} ↔ ${selectedMarketplace.product.title}`}
                  tone="info"
                  action={{
                    content: "Eslestir",
                    onAction: createManualMatch,
                  }}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    );
  };

  const renderLogsTab = () => (
    <Layout>
      <Layout.Section>
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Sync Loglari
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              Son sync islemleri burada gorunecek.
            </Text>
          </BlockStack>
        </Card>
      </Layout.Section>
    </Layout>
  );

  const renderInvoiceTab = () => (
    <Layout>
      {/* Provider Selection & Settings */}
      <Layout.Section>
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              E-Fatura Entegrasyonu
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              Fatura saglayicinizi secin ve bilgilerinizi girin.
            </Text>

            <InlineGrid columns={{ xs: 2, md: 5 }} gap="300">
              {INVOICE_PROVIDERS.map((p) => {
                const isSelected = selectedProvider === p.id;
                const isConfigured =
                  invoiceSettings?.configured &&
                  invoiceSettings.provider === p.id;
                return (
                  <Box
                    key={p.id}
                    padding="400"
                    borderWidth="025"
                    borderColor={
                      isSelected
                        ? "border-info"
                        : isConfigured
                          ? "border-success"
                          : "border"
                    }
                    borderRadius="200"
                    background={
                      isSelected
                        ? "bg-surface-info"
                        : isConfigured
                          ? "bg-surface-success"
                          : "bg-surface"
                    }
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProvider(p.id);
                        setInvoiceCreds({});
                        setInvoiceSaveResult(null);
                      }}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        display: "block",
                        width: "100%",
                        textAlign: "center",
                      }}
                    >
                      <BlockStack gap="100" align="center" inlineAlign="center">
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {p.name}
                        </Text>
                        {isConfigured && (
                          <Badge tone="success">Aktif</Badge>
                        )}
                      </BlockStack>
                    </button>
                  </Box>
                );
              })}
            </InlineGrid>

            {selectedProvider && (
              <>
                <Divider />
                <Text as="h3" variant="headingSm">
                  {
                    INVOICE_PROVIDERS.find((p) => p.id === selectedProvider)
                      ?.name
                  }{" "}
                  Ayarlari
                </Text>
                <FormLayout>
                  {INVOICE_PROVIDERS.find(
                    (p) => p.id === selectedProvider,
                  )?.fields.map((field) => (
                    <TextField
                      key={field.key}
                      label={field.label}
                      type={field.type === "password" ? "password" : "text"}
                      value={invoiceCreds[field.key] || ""}
                      onChange={(val) =>
                        setInvoiceCreds({
                          ...invoiceCreds,
                          [field.key]: val,
                        })
                      }
                      autoComplete="off"
                    />
                  ))}
                  <Checkbox
                    label="Siparislerde otomatik fatura olustur"
                    checked={autoInvoice}
                    onChange={setAutoInvoice}
                  />
                  <Button
                    variant="primary"
                    onClick={saveInvoiceSettings}
                    loading={invoiceSaving}
                  >
                    Kaydet ve Test Et
                  </Button>
                </FormLayout>
                {invoiceSaveResult && (
                  <Banner
                    title={
                      invoiceSaveResult.success
                        ? "Baglanti basarili!"
                        : `Hata: ${invoiceSaveResult.error}`
                    }
                    tone={
                      invoiceSaveResult.success ? "success" : "critical"
                    }
                    onDismiss={() => setInvoiceSaveResult(null)}
                  />
                )}
              </>
            )}
          </BlockStack>
        </Card>
      </Layout.Section>

      {/* Create Invoice Modal */}
      {invoiceSettings?.configured && invoiceSettings.isActive && (
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Manuel Fatura Olustur
                </Text>
                <Button
                  variant="primary"
                  onClick={() => setShowInvoiceForm(true)}
                >
                  Yeni Fatura
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      )}

      <Modal
        open={showInvoiceForm}
        onClose={() => setShowInvoiceForm(false)}
        title="Yeni Fatura Olustur"
        size="large"
        primaryAction={{
          content: creatingInvoice ? "Gonderiliyor..." : "Fatura Olustur",
          onAction: createInvoice,
          disabled:
            creatingInvoice ||
            invoiceItems.length === 0 ||
            !invoiceForm.orderNumber ||
            !invoiceForm.customerName,
          loading: creatingInvoice,
        }}
        secondaryActions={[
          {
            content: "Iptal",
            onAction: () => setShowInvoiceForm(false),
          },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <FormLayout.Group>
              <TextField
                label="Siparis No *"
                value={invoiceForm.orderNumber}
                onChange={(val) =>
                  setInvoiceForm({ ...invoiceForm, orderNumber: val })
                }
                autoComplete="off"
              />
              <Select
                label="Siparis Kaynagi"
                options={[
                  { label: "Seciniz", value: "" },
                  { label: "Shopify", value: "shopify" },
                  { label: "Trendyol", value: "trendyol" },
                  { label: "Hepsiburada", value: "hepsiburada" },
                  { label: "N11", value: "n11" },
                ]}
                value={invoiceForm.orderSource}
                onChange={(val) =>
                  setInvoiceForm({ ...invoiceForm, orderSource: val })
                }
              />
            </FormLayout.Group>
            <FormLayout.Group>
              <TextField
                label="Musteri Adi *"
                value={invoiceForm.customerName}
                onChange={(val) =>
                  setInvoiceForm({ ...invoiceForm, customerName: val })
                }
                autoComplete="off"
              />
              <TextField
                label="VKN / TCKN"
                value={invoiceForm.customerTaxId}
                onChange={(val) =>
                  setInvoiceForm({ ...invoiceForm, customerTaxId: val })
                }
                autoComplete="off"
              />
            </FormLayout.Group>
            <FormLayout.Group>
              <TextField
                label="Vergi Dairesi"
                value={invoiceForm.customerTaxOffice}
                onChange={(val) =>
                  setInvoiceForm({
                    ...invoiceForm,
                    customerTaxOffice: val,
                  })
                }
                autoComplete="off"
              />
              <TextField
                label="Adres"
                value={invoiceForm.customerAddress}
                onChange={(val) =>
                  setInvoiceForm({
                    ...invoiceForm,
                    customerAddress: val,
                  })
                }
                autoComplete="off"
              />
              <TextField
                label="Sehir"
                value={invoiceForm.customerCity}
                onChange={(val) =>
                  setInvoiceForm({ ...invoiceForm, customerCity: val })
                }
                autoComplete="off"
              />
            </FormLayout.Group>
          </FormLayout>
        </Modal.Section>
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="h3" variant="headingSm">
              Fatura Kalemleri
            </Text>

            {invoiceItems.length > 0 && (
              <DataTable
                columnContentTypes={[
                  "text",
                  "numeric",
                  "numeric",
                  "numeric",
                  "numeric",
                  "text",
                ]}
                headings={[
                  "Urun",
                  "Adet",
                  "Birim Fiyat",
                  "KDV %",
                  "Toplam",
                  "",
                ]}
                rows={invoiceItems.map((item, idx) => [
                  item.name,
                  String(item.quantity),
                  `${item.unitPrice.toFixed(2)} TL`,
                  `%${item.vatRate}`,
                  `${item.totalPrice.toFixed(2)} TL`,
                  <Button
                    key={idx}
                    variant="plain"
                    tone="critical"
                    onClick={() => removeInvoiceItem(idx)}
                  >
                    Sil
                  </Button>,
                ])}
                totals={[
                  "",
                  "",
                  "",
                  "",
                  `${invoiceItems.reduce((s, i) => s + i.totalPrice, 0).toFixed(2)} TL`,
                  "",
                ]}
                showTotalsInFooter
              />
            )}

            <FormLayout>
              <FormLayout.Group>
                <TextField
                  label="Urun Adi"
                  value={invoiceForm.itemName}
                  onChange={(val) =>
                    setInvoiceForm({ ...invoiceForm, itemName: val })
                  }
                  autoComplete="off"
                />
                <TextField
                  label="Adet"
                  type="number"
                  value={invoiceForm.itemQuantity}
                  onChange={(val) =>
                    setInvoiceForm({ ...invoiceForm, itemQuantity: val })
                  }
                  autoComplete="off"
                />
                <TextField
                  label="Birim Fiyat"
                  type="number"
                  value={invoiceForm.itemUnitPrice}
                  onChange={(val) =>
                    setInvoiceForm({ ...invoiceForm, itemUnitPrice: val })
                  }
                  autoComplete="off"
                />
                <TextField
                  label="KDV %"
                  type="number"
                  value={invoiceForm.itemVatRate}
                  onChange={(val) =>
                    setInvoiceForm({ ...invoiceForm, itemVatRate: val })
                  }
                  autoComplete="off"
                />
              </FormLayout.Group>
              <Button onClick={addInvoiceItem}>Kalem Ekle</Button>
            </FormLayout>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Invoice List */}
      <Layout.Section>
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Kesilen Faturalar
            </Text>
            {invoiceList.length === 0 ? (
              <Text as="p" variant="bodyMd" tone="subdued">
                Henuz fatura kesilmemis.
              </Text>
            ) : (
              <DataTable
                columnContentTypes={[
                  "text",
                  "text",
                  "numeric",
                  "text",
                  "text",
                  "text",
                ]}
                headings={[
                  "Siparis No",
                  "Musteri",
                  "Tutar",
                  "Tarih",
                  "Durum",
                  "PDF",
                ]}
                rows={invoiceList.map((inv) => [
                  `#${inv.orderNumber}`,
                  `${inv.customerName || ""}${inv.orderSource ? ` (${inv.orderSource})` : ""}`,
                  `${inv.totalAmount} ${inv.currency}`,
                  new Date(inv.createdAt).toLocaleDateString("tr-TR"),
                  invoiceStatusBadge(inv.status),
                  inv.pdfUrl ? (
                    <a
                      key={inv.id}
                      href={inv.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      PDF
                    </a>
                  ) : (
                    ""
                  ),
                ])}
              />
            )}
          </BlockStack>
        </Card>
      </Layout.Section>
    </Layout>
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const tabs = [
    { id: "setup", content: "Kurulum" },
    { id: "matching", content: "Urun Eslestirme" },
    { id: "logs", content: "Sync Loglari" },
    { id: "invoice", content: "E-Fatura" },
  ];

  const tabContent = [
    renderSetupTab,
    renderMatchingTab,
    renderLogsTab,
    renderInvoiceTab,
  ];

  return (
    <Page
      title="BayiPortal Entegrasyon"
      subtitle={settings.shop.domain}
      titleMetadata={
        <Badge tone="info">
          {`${settings.shop.plan === "free" ? "Ucretsiz" : settings.shop.plan} -- ${activeMatchCount}/${settings.shop.productLimit} urun`}
        </Badge>
      }
    >
      <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
        <Box paddingBlockStart="400">{tabContent[selectedTab]()}</Box>
      </Tabs>
    </Page>
  );
}
