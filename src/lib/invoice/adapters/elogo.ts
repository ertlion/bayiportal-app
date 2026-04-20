/**
 * e-Logo (Logo Cloud) e-Fatura Adapter
 *
 * REST API with API key + secret auth (HMAC signed requests).
 *
 * Credentials required:
 *   - elogo_api_key
 *   - elogo_secret_key
 */

import type { InvoiceAdapter, InvoiceCredentials, InvoiceRequest, InvoiceResult } from "../types";
import crypto from "crypto";

const BASE_URL = "https://api.elogo.com.tr/v1";

function generateSignature(secretKey: string, timestamp: string, body: string): string {
  const payload = `${timestamp}${body}`;
  return crypto.createHmac("sha256", secretKey).update(payload).digest("hex");
}

async function apiRequest(
  creds: InvoiceCredentials,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: Record<string, unknown> }> {
  const timestamp = new Date().toISOString();
  const bodyStr = body ? JSON.stringify(body) : "";
  const signature = generateSignature(creds.elogo_secret_key, timestamp, bodyStr);

  const headers: Record<string, string> = {
    "X-Api-Key": creds.elogo_api_key,
    "X-Timestamp": timestamp,
    "X-Signature": signature,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    ...(body ? { body: bodyStr } : {}),
  });

  const data = await res.json() as Record<string, unknown>;
  return { status: res.status, data };
}

// ==================== ADAPTER ====================

export class ElogoAdapter implements InvoiceAdapter {
  name = "elogo" as const;

  async testConnection(creds: InvoiceCredentials): Promise<{ success: boolean; error?: string }> {
    try {
      if (!creds.elogo_api_key || !creds.elogo_secret_key) {
        return { success: false, error: "API Key ve Secret Key gerekli" };
      }

      // Test with a simple status/health endpoint
      const res = await apiRequest(creds, "GET", "/status");
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
        invoiceType: "SATIS",
        profileId: "TEMELFATURA",
        issueDate: invoice.orderDate.split("T")[0],
        currency: invoice.currency || "TRY",
        orderNumber: invoice.orderNumber,
        customer: {
          name: invoice.customerName,
          taxId: invoice.customerTaxId || "",
          taxOffice: invoice.customerTaxOffice || "",
          address: invoice.customerAddress || "",
          city: invoice.customerCity || "",
          idType: (invoice.customerTaxId || "").length === 11 ? "TCKN" : "VKN",
        },
        lines: invoice.items.map((item, idx) => ({
          lineNumber: idx + 1,
          itemName: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          vatRate: item.vatRate,
          totalPrice: item.totalPrice,
          unitCode: "C62",
        })),
        totals: {
          totalAmount: invoice.totalAmount,
        },
      };

      const res = await apiRequest(creds, "POST", "/invoices", payload);

      if (res.status >= 400) {
        const errData = res.data as { message?: string; error?: string };
        return { success: false, error: errData?.message || errData?.error || "Fatura olusturulamadi" };
      }

      const invData = res.data as { id?: string; invoiceId?: string; pdfUrl?: string };

      return {
        success: true,
        externalId: invData.invoiceId || invData.id || undefined,
        pdfUrl: invData.pdfUrl || undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Fatura olusturma hatasi";
      return { success: false, error: message };
    }
  }

  async cancelInvoice(creds: InvoiceCredentials, externalId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await apiRequest(creds, "POST", `/invoices/${externalId}/cancel`);
      if (res.status >= 400) {
        const errData = res.data as { message?: string };
        return { success: false, error: errData?.message || "Iptal hatasi" };
      }
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Iptal hatasi";
      return { success: false, error: message };
    }
  }

  async getInvoicePdf(creds: InvoiceCredentials, externalId: string): Promise<{ success: boolean; pdfUrl?: string; error?: string }> {
    try {
      const res = await apiRequest(creds, "GET", `/invoices/${externalId}/pdf`);
      if (res.status >= 400) {
        const errData = res.data as { message?: string };
        return { success: false, error: errData?.message || "PDF alinamadi" };
      }
      const data = res.data as { pdfUrl?: string; url?: string };
      return { success: true, pdfUrl: data.pdfUrl || data.url };
    } catch (err) {
      const message = err instanceof Error ? err.message : "PDF hatasi";
      return { success: false, error: message };
    }
  }
}
