/**
 * KolayBi e-Fatura Adapter
 *
 * Simple REST API with API key auth.
 *
 * Credentials required:
 *   - kolaybi_api_key
 */

import type { InvoiceAdapter, InvoiceCredentials, InvoiceRequest, InvoiceResult } from "../types";

const BASE_URL = "https://api.kolaybi.com/v1";

async function apiRequest(
  creds: InvoiceCredentials,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${creds.kolaybi_api_key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json() as Record<string, unknown>;
  return { status: res.status, data };
}

// ==================== ADAPTER ====================

export class KolaybiAdapter implements InvoiceAdapter {
  name = "kolaybi" as const;

  async testConnection(creds: InvoiceCredentials): Promise<{ success: boolean; error?: string }> {
    try {
      if (!creds.kolaybi_api_key) {
        return { success: false, error: "API Key gerekli" };
      }

      // Test auth with a simple endpoint
      const res = await apiRequest(creds, "GET", "/hesap");
      if (res.status === 401 || res.status === 403) {
        return { success: false, error: "Gecersiz API anahtari" };
      }
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Baglanti hatasi";
      return { success: false, error: message };
    }
  }

  async createInvoice(creds: InvoiceCredentials, invoice: InvoiceRequest): Promise<InvoiceResult> {
    try {
      const payload = {
        faturaTipi: "SATIS",
        tarih: invoice.orderDate.split("T")[0],
        paraBirimi: invoice.currency || "TRY",
        siparisNo: invoice.orderNumber,
        musteri: {
          ad: invoice.customerName,
          vergiNo: invoice.customerTaxId || "",
          vergiDairesi: invoice.customerTaxOffice || "",
          adres: invoice.customerAddress || "",
          sehir: invoice.customerCity || "",
        },
        kalemler: invoice.items.map((item) => ({
          ad: item.name,
          miktar: item.quantity,
          birimFiyat: item.unitPrice,
          kdvOrani: item.vatRate,
          toplamFiyat: item.totalPrice,
        })),
        toplamTutar: invoice.totalAmount,
      };

      const res = await apiRequest(creds, "POST", "/faturalar", payload);

      if (res.status >= 400) {
        const errData = res.data as { mesaj?: string; hata?: string; message?: string };
        return { success: false, error: errData?.mesaj || errData?.hata || errData?.message || "Fatura olusturulamadi" };
      }

      const invData = res.data as { id?: string; faturaId?: string; pdfUrl?: string };

      return {
        success: true,
        externalId: invData.faturaId || invData.id || undefined,
        pdfUrl: invData.pdfUrl || undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Fatura olusturma hatasi";
      return { success: false, error: message };
    }
  }

  async cancelInvoice(creds: InvoiceCredentials, externalId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await apiRequest(creds, "POST", `/faturalar/${externalId}/iptal`);
      if (res.status >= 400) {
        const errData = res.data as { mesaj?: string; message?: string };
        return { success: false, error: errData?.mesaj || errData?.message || "Iptal hatasi" };
      }
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Iptal hatasi";
      return { success: false, error: message };
    }
  }

  async getInvoicePdf(creds: InvoiceCredentials, externalId: string): Promise<{ success: boolean; pdfUrl?: string; error?: string }> {
    try {
      const res = await apiRequest(creds, "GET", `/faturalar/${externalId}/pdf`);
      if (res.status >= 400) {
        const errData = res.data as { mesaj?: string };
        return { success: false, error: errData?.mesaj || "PDF alinamadi" };
      }
      const data = res.data as { pdfUrl?: string; url?: string };
      return { success: true, pdfUrl: data.pdfUrl || data.url };
    } catch (err) {
      const message = err instanceof Error ? err.message : "PDF hatasi";
      return { success: false, error: message };
    }
  }
}
