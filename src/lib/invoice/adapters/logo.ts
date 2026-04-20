/**
 * Logo e-Fatura Adapter
 *
 * REST API with token-based auth.
 *
 * Credentials required:
 *   - logo_username
 *   - logo_password
 *   - logo_firm_id
 */

import type { InvoiceAdapter, InvoiceCredentials, InvoiceRequest, InvoiceResult } from "../types";

const BASE_URL = "https://efatura.logo.com.tr/api";

// ==================== TOKEN CACHE ====================

interface TokenEntry {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenEntry>();

async function getToken(creds: InvoiceCredentials): Promise<string> {
  const key = `logo:${creds.logo_firm_id}:${creds.logo_username}`;
  const cached = tokenCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.token;
  }

  const res = await fetch(`${BASE_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: creds.logo_username,
      password: creds.logo_password,
      firmId: creds.logo_firm_id,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Logo token hatasi (${res.status}): ${text.substring(0, 300)}`);
  }

  const data = await res.json() as { token: string; expiresIn?: number };

  // Default 1 hour, with 5 min buffer
  const expiresIn = (data.expiresIn || 3600) - 300;
  tokenCache.set(key, {
    token: data.token,
    expiresAt: Date.now() + expiresIn * 1000,
  });

  return data.token;
}

async function apiRequest(
  creds: InvoiceCredentials,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: Record<string, unknown> }> {
  const token = await getToken(creds);

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json() as Record<string, unknown>;
  return { status: res.status, data };
}

// ==================== ADAPTER ====================

export class LogoAdapter implements InvoiceAdapter {
  name = "logo" as const;

  async testConnection(creds: InvoiceCredentials): Promise<{ success: boolean; error?: string }> {
    try {
      if (!creds.logo_username || !creds.logo_password || !creds.logo_firm_id) {
        return { success: false, error: "Kullanici adi, sifre ve firma ID gerekli" };
      }
      await getToken(creds);
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
        notes: `Siparis #${invoice.orderNumber}`,
        customer: {
          name: invoice.customerName,
          taxId: invoice.customerTaxId || "",
          taxOffice: invoice.customerTaxOffice || "",
          address: invoice.customerAddress || "",
          city: invoice.customerCity || "",
        },
        lines: invoice.items.map((item, idx) => ({
          lineNumber: idx + 1,
          itemName: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          vatRate: item.vatRate,
          unitCode: "C62",
        })),
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
