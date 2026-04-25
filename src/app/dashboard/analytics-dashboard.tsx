"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  InlineGrid,
  Box,
  Badge,
  Spinner,
  Select,
  DataTable,
  Divider,
} from "@shopify/polaris";
import { useAuthenticatedFetch } from "../providers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnalyticsOverview {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  totalProducts: number;
  activeMatchings: number;
}

interface MarketplaceOrder {
  marketplace: string;
  orders: number;
  revenue: number;
}

interface DayOrder {
  date: string;
  orders: number;
  revenue: number;
}

interface TopProduct {
  name: string;
  orders: number;
  quantity: number;
  revenue: number;
}

interface StockAlert {
  productName: string;
  variantName: string;
  stockQuantity: number;
}

interface SyncHealth {
  lastSync: string;
  successRate: number;
  errorCount: number;
  recentErrors: string[];
}

interface AnalyticsData {
  overview: AnalyticsOverview;
  ordersByMarketplace: MarketplaceOrder[];
  ordersByDay: DayOrder[];
  topProducts: TopProduct[];
  stockAlerts: StockAlert[];
  syncHealth: SyncHealth;
}

type Period = "7d" | "30d" | "90d";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MARKETPLACE_COLORS: Record<string, string> = {
  trendyol: "#f27a1a",
  hepsiburada: "#ff6000",
  n11: "#7b2d8e",
  pazarama: "#00b900",
  shopify: "#96bf48",
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleString("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function syncHealthTone(rate: number): "success" | "warning" | "critical" {
  if (rate >= 90) return "success";
  if (rate >= 70) return "warning";
  return "critical";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function OverviewCards({ overview, stockAlertCount }: { overview: AnalyticsOverview; stockAlertCount: number }) {
  const cards: {
    label: string;
    value: string;
    icon: string;
    tone?: "critical";
  }[] = [
    {
      label: "Toplam Siparis",
      value: String(overview.totalOrders),
      icon: "\uD83D\uDECD\uFE0F",
    },
    {
      label: "Toplam Gelir",
      value: formatCurrency(overview.totalRevenue),
      icon: "\uD83D\uDCB0",
    },
    {
      label: "Aktif Urun",
      value: String(overview.totalProducts),
      icon: "\uD83D\uDCE6",
    },
    {
      label: "Stok Uyarisi",
      value: String(stockAlertCount),
      icon: "\u26A0\uFE0F",
      tone: stockAlertCount > 0 ? "critical" : undefined,
    },
  ];

  return (
    <InlineGrid columns={{ xs: 2, md: 4 }} gap="400">
      {cards.map((card) => (
        <Card key={card.label}>
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="span" variant="bodySm" tone="subdued">
                {card.label}
              </Text>
              <Text as="span" variant="bodyLg">
                {card.icon}
              </Text>
            </InlineStack>
            <Text
              as="p"
              variant="headingLg"
              fontWeight="bold"
              tone={card.tone}
            >
              {card.value}
            </Text>
          </BlockStack>
        </Card>
      ))}
    </InlineGrid>
  );
}

function MarketplaceBreakdown({ data }: { data: MarketplaceOrder[] }) {
  const totalOrders = data.reduce((sum, m) => sum + m.orders, 0);
  const totalRevenue = data.reduce((sum, m) => sum + m.revenue, 0);

  if (data.length === 0) {
    return (
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            Pazaryeri Dagilimi
          </Text>
          <Text as="p" variant="bodyMd" tone="subdued">
            Henuz siparis verisi yok.
          </Text>
        </BlockStack>
      </Card>
    );
  }

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Pazaryeri Dagilimi
        </Text>
        <BlockStack gap="300">
          {data.map((mp) => {
            const orderPct = totalOrders > 0 ? (mp.orders / totalOrders) * 100 : 0;
            const revenuePct = totalRevenue > 0 ? (mp.revenue / totalRevenue) * 100 : 0;
            const color = MARKETPLACE_COLORS[mp.marketplace] || "#999";
            const displayName = mp.marketplace.charAt(0).toUpperCase() + mp.marketplace.slice(1);

            return (
              <BlockStack key={mp.marketplace} gap="100">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        backgroundColor: color,
                        flexShrink: 0,
                      }}
                    />
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {displayName}
                    </Text>
                  </InlineStack>
                  <InlineStack gap="300">
                    <Text as="span" variant="bodySm" tone="subdued">
                      {mp.orders} siparis
                    </Text>
                    <Text as="span" variant="bodySm" fontWeight="semibold">
                      {formatCurrency(mp.revenue)}
                    </Text>
                  </InlineStack>
                </InlineStack>
                {/* Order bar */}
                <div
                  style={{
                    width: "100%",
                    height: 8,
                    backgroundColor: "#e4e5e7",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(orderPct, 2)}%`,
                      height: "100%",
                      backgroundColor: color,
                      borderRadius: 4,
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
                <Text as="span" variant="bodySm" tone="subdued">
                  Siparis: %{orderPct.toFixed(1)} | Gelir: %{revenuePct.toFixed(1)}
                </Text>
              </BlockStack>
            );
          })}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

function OrdersByDayChart({ data }: { data: DayOrder[] }) {
  const maxOrders = Math.max(...data.map((d) => d.orders), 1);

  if (data.length === 0) {
    return (
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            Gunluk Siparisler
          </Text>
          <Text as="p" variant="bodyMd" tone="subdued">
            Henuz veri yok.
          </Text>
        </BlockStack>
      </Card>
    );
  }

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Gunluk Siparisler
        </Text>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 4,
            height: 160,
            padding: "0 4px",
          }}
        >
          {data.map((day) => {
            const heightPct = (day.orders / maxOrders) * 100;
            return (
              <div
                key={day.date}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: "#6d7175",
                    whiteSpace: "nowrap",
                  }}
                >
                  {day.orders}
                </span>
                <div
                  style={{
                    width: "100%",
                    maxWidth: 32,
                    height: `${Math.max(heightPct, 4)}%`,
                    backgroundColor: "#5c6ac4",
                    borderRadius: "4px 4px 0 0",
                    transition: "height 0.3s ease",
                    minHeight: 4,
                  }}
                />
                <span
                  style={{
                    fontSize: 9,
                    color: "#6d7175",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "100%",
                  }}
                >
                  {formatDate(day.date)}
                </span>
              </div>
            );
          })}
        </div>
      </BlockStack>
    </Card>
  );
}

function TopProductsTable({ data }: { data: TopProduct[] }) {
  const rows = data.slice(0, 5).map((p) => [
    p.name,
    String(p.orders),
    String(p.quantity),
    formatCurrency(p.revenue),
  ]);

  if (data.length === 0) {
    return (
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            En Cok Satan Urunler
          </Text>
          <Text as="p" variant="bodyMd" tone="subdued">
            Henuz satis verisi yok.
          </Text>
        </BlockStack>
      </Card>
    );
  }

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          En Cok Satan Urunler
        </Text>
        <DataTable
          columnContentTypes={["text", "numeric", "numeric", "numeric"]}
          headings={["Urun", "Siparis", "Adet", "Gelir"]}
          rows={rows}
        />
      </BlockStack>
    </Card>
  );
}

function StockAlertsList({ alerts }: { alerts: StockAlert[] }) {
  const outOfStock = alerts.filter((a) => a.stockQuantity === 0);

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingMd">
            Stok Uyarilari
          </Text>
          {outOfStock.length > 0 && (
            <Badge tone="critical">
              {`${outOfStock.length} urun tukendi`}
            </Badge>
          )}
        </InlineStack>
        {alerts.length === 0 ? (
          <Text as="p" variant="bodyMd" tone="subdued">
            Stok sorunu yok.
          </Text>
        ) : (
          <BlockStack gap="200">
            {alerts.slice(0, 10).map((alert, idx) => (
              <Box
                key={`${alert.productName}-${alert.variantName}-${idx}`}
                padding="300"
                borderWidth="025"
                borderColor={alert.stockQuantity === 0 ? "border-critical" : "border-caution"}
                borderRadius="100"
                background={alert.stockQuantity === 0 ? "bg-surface-critical" : "bg-surface-caution"}
              >
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {alert.productName}
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {alert.variantName}
                    </Text>
                  </BlockStack>
                  <Badge tone={alert.stockQuantity === 0 ? "critical" : "warning"}>
                    {`Stok: ${alert.stockQuantity}`}
                  </Badge>
                </InlineStack>
              </Box>
            ))}
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}

function SyncHealthCard({ health }: { health: SyncHealth }) {
  const tone = syncHealthTone(health.successRate);

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Sync Durumu
        </Text>
        <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
          <BlockStack gap="100">
            <Text as="span" variant="bodySm" tone="subdued">
              Basari Orani
            </Text>
            <InlineStack gap="200" blockAlign="center">
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  backgroundColor:
                    tone === "success"
                      ? "#008060"
                      : tone === "warning"
                        ? "#b98900"
                        : "#d72c0d",
                }}
              />
              <Text as="span" variant="headingMd" fontWeight="bold">
                %{health.successRate}
              </Text>
            </InlineStack>
          </BlockStack>
          <BlockStack gap="100">
            <Text as="span" variant="bodySm" tone="subdued">
              Son Sync
            </Text>
            <Text as="span" variant="bodyMd">
              {formatDateTime(health.lastSync)}
            </Text>
          </BlockStack>
          <BlockStack gap="100">
            <Text as="span" variant="bodySm" tone="subdued">
              Hata Sayisi
            </Text>
            <Text
              as="span"
              variant="bodyMd"
              tone={health.errorCount > 0 ? "critical" : undefined}
            >
              {health.errorCount}
            </Text>
          </BlockStack>
        </InlineGrid>
        {health.recentErrors.length > 0 && (
          <>
            <Divider />
            <BlockStack gap="100">
              <Text as="span" variant="bodySm" tone="subdued">
                Son Hatalar
              </Text>
              {health.recentErrors.slice(0, 3).map((err, i) => (
                <Text key={i} as="p" variant="bodySm" tone="critical">
                  {err}
                </Text>
              ))}
            </BlockStack>
          </>
        )}
      </BlockStack>
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card>
      <BlockStack gap="300">
        <div
          style={{
            height: 20,
            width: "40%",
            backgroundColor: "#e4e5e7",
            borderRadius: 4,
          }}
        />
        <div
          style={{
            height: 32,
            width: "60%",
            backgroundColor: "#e4e5e7",
            borderRadius: 4,
          }}
        />
      </BlockStack>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <Layout>
      <Layout.Section>
        <InlineGrid columns={{ xs: 2, md: 4 }} gap="400">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </InlineGrid>
      </Layout.Section>
      <Layout.Section>
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <Card>
            <BlockStack gap="300">
              <div style={{ height: 20, width: "50%", backgroundColor: "#e4e5e7", borderRadius: 4 }} />
              <div style={{ height: 120, backgroundColor: "#e4e5e7", borderRadius: 4 }} />
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="300">
              <div style={{ height: 20, width: "50%", backgroundColor: "#e4e5e7", borderRadius: 4 }} />
              <div style={{ height: 120, backgroundColor: "#e4e5e7", borderRadius: 4 }} />
            </BlockStack>
          </Card>
        </InlineGrid>
      </Layout.Section>
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AnalyticsDashboard() {
  const authFetch = useAuthenticatedFetch();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("30d");

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/analytics?period=${period}`);
      if (!res.ok) {
        throw new Error(`API hata: ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bilinmeyen hata";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [authFetch, period]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const periodOptions = [
    { label: "7 Gun", value: "7d" },
    { label: "30 Gun", value: "30d" },
    { label: "90 Gun", value: "90d" },
  ];

  return (
    <Layout>
      {/* Period Selector */}
      <Layout.Section>
        <InlineStack align="end">
          <div style={{ width: 160 }}>
            <Select
              label=""
              labelHidden
              options={periodOptions}
              value={period}
              onChange={(val) => setPeriod(val as Period)}
            />
          </div>
        </InlineStack>
      </Layout.Section>

      {loading && (
        <Layout.Section>
          <LoadingSkeleton />
        </Layout.Section>
      )}

      {error && !loading && (
        <Layout.Section>
          <Card>
            <BlockStack gap="200" align="center" inlineAlign="center">
              <Text as="p" variant="bodyMd" tone="critical">
                Analitik verileri yuklenemedi: {error}
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      )}

      {data && !loading && (
        <>
          {/* Overview Cards */}
          <Layout.Section>
            <OverviewCards
              overview={data.overview}
              stockAlertCount={data.stockAlerts.length}
            />
          </Layout.Section>

          {/* Charts Row */}
          <Layout.Section>
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              <MarketplaceBreakdown data={data.ordersByMarketplace} />
              <OrdersByDayChart data={data.ordersByDay} />
            </InlineGrid>
          </Layout.Section>

          {/* Products & Alerts Row */}
          <Layout.Section>
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              <TopProductsTable data={data.topProducts} />
              <StockAlertsList alerts={data.stockAlerts} />
            </InlineGrid>
          </Layout.Section>

          {/* Sync Health */}
          <Layout.Section>
            <SyncHealthCard health={data.syncHealth} />
          </Layout.Section>
        </>
      )}
    </Layout>
  );
}
