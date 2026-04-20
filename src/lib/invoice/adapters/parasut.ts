/**
 * Parasut (Mikro Yazilim) e-Fatura Adapter
 *
 * OAuth2 based REST API with JSON:API format.
 *
 * Auth: OAuth2 Resource Owner Password Grant
 *   POST https://api.parasut.com/oauth/token
 *
 * Credentials required:
 *   - parasut_client_id
 *   - parasut_client_secret
 *   - parasut_company_id
 *   - parasut_username
 *   - parasut_password
 */

import type { InvoiceAdapter, InvoiceCredentials, InvoiceRequest, InvoiceResult } from "../types";

const BASE_URL = "https://api.parasut.com";

// ==================== TOKEN CACHE ====================

interface TokenEntry {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenEntry>();

function getCacheKey(creds: InvoiceCredentials): string {
  return `parasut:${creds.parasut_company_id}:${creds.parasut_username}`;
}

async function getAccessToken(creds: InvoiceCredentials): Promise<string> {
  const key = getCacheKey(creds);
  const cached = tokenCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.accessToken;
  }

  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: creds.parasut_client_id,
      client_secret: creds.parasut_client_secret,
      username: creds.parasut_username,
      password: creds.parasut_password,
      redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Parasut token hatasi (${res.status}): ${text.substring(0, 300)}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  const token = data.access_token;

  // Cache with 10 min buffer
  tokenCache.set(key, {
    accessToken: token,
    expiresAt: Date.now() + (data.expires_in - 600) * 1000,
  });

  return token;
}

async function apiRequest(
  creds: InvoiceCredentials,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: Record<string, unknown> }> {
  const token = await getAccessToken(creds);
  const companyId = creds.parasut_company_id;

  const res = await fetch(`${BASE_URL}/v4/${companyId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json() as Record<string, unknown>;
  return { status: res.status, data };
}

// ==================== ADAPTER ====================

export class ParasutAdapter implements InvoiceAdapter {
  name = "parasut" as const;

  async testConnection(creds: InvoiceCredentials): Promise<{ success: boolean; error?: string }> {
    try {
      if (!creds.parasut_client_id || !creds.parasut_client_secret || !creds.parasut_company_id || !creds.parasut_username || !creds.parasut_password) {
        return { success: false, error: "Tum Parasut kimlik bilgileri gerekli" };
      }
      await getAccessToken(creds);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Baglanti hatasi";
      return { success: false, error: message };
    }
  }

  async createInvoice(creds: InvoiceCredentials, invoice: InvoiceRequest): Promise<InvoiceResult> {
    try {
      // Step 1: Create or find the contact
      const contactPayload = {
        data: {
          type: "contacts",
          attributes: {
            name: invoice.customerName,
            tax_number: invoice.customerTaxId || undefined,
            tax_office: invoice.customerTaxOffice || undefined,
            address: invoice.customerAddress || undefined,
            city: invoice.customerCity || undefined,
            contact_type: invoice.customerTaxId && invoice.customerTaxId.length === 10 ? "company" : "person",
          },
        },
      };

      const contactRes = await apiRequest(creds, "POST", "/contacts", contactPayload);
      const contactData = contactRes.data as { data?: { id?: string } };
      const contactId = contactData?.data?.id;

      if (!contactId) {
        return { success: false, error: "Musteri olusturulamadi" };
      }

      // Step 2: Create the sales invoice
      const invoiceDetails = invoice.items.map((item) => ({
        type: "sales_invoice_details",
        attributes: {
          quantity: item.quantity,
          unit_price: item.unitPrice,
          vat_rate: item.vatRate,
          description: item.name,
        },
      }));

      const invoicePayload = {
        data: {
          type: "sales_invoices",
          attributes: {
            item_type: "invoice",
            description: `Siparis #${invoice.orderNumber}`,
            issue_date: invoice.orderDate.split("T")[0],
            currency: invoice.currency || "TRY",
          },
          relationships: {
            contact: {
              data: {
                id: contactId,
                type: "contacts",
              },
            },
            details: {
              data: invoiceDetails,
            },
          },
        },
      };

      const invoiceRes = await apiRequest(creds, "POST", "/sales_invoices", invoicePayload);

      if (invoiceRes.status >= 400) {
        const errData = invoiceRes.data as { errors?: Array<{ title?: string; detail?: string }> };
        const errMsg = errData?.errors?.[0]?.detail || errData?.errors?.[0]?.title || "Fatura olusturulamadi";
        return { success: false, error: errMsg };
      }

      const invData = invoiceRes.data as { data?: { id?: string } };
      const externalId = invData?.data?.id;

      return {
        success: true,
        externalId: externalId || undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Fatura olusturma hatasi";
      return { success: false, error: message };
    }
  }

  async cancelInvoice(creds: InvoiceCredentials, externalId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await apiRequest(creds, "DELETE", `/sales_invoices/${externalId}`);
      if (res.status >= 400) {
        const errData = res.data as { errors?: Array<{ detail?: string }> };
        return { success: false, error: errData?.errors?.[0]?.detail || "Iptal hatasi" };
      }
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Iptal hatasi";
      return { success: false, error: message };
    }
  }
}
