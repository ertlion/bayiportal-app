/**
 * Uyumsoft e-Fatura Adapter
 *
 * SOAP-based integration with Uyumsoft e-fatura.
 * Endpoints:
 *   Production: https://efatura.uyumsoft.com.tr/services/Integration
 *   Test:       https://efatura-test.uyumsoft.com.tr/services/Integration
 *
 * Auth: username/password -> SessionId (valid 8h, cached 7h)
 *
 * Credentials required:
 *   - uyumsoft_username
 *   - uyumsoft_password
 *   - uyumsoft_is_test ("true" or "false")
 *   - uyumsoft_vkn (seller VKN/TCKN)
 *   - uyumsoft_company_name
 *   - uyumsoft_address
 *   - uyumsoft_city
 */

import type { InvoiceAdapter, InvoiceCredentials, InvoiceRequest, InvoiceResult } from "../types";

// ==================== SESSION CACHE ====================

interface SessionEntry {
  sessionId: string;
  expiresAt: number;
}

const sessionCache = new Map<string, SessionEntry>();
const SESSION_TTL_MS = 7 * 60 * 60 * 1000; // 7 hours

function getCacheKey(username: string, isTest: boolean): string {
  return `uyumsoft:${username}:${isTest ? "test" : "prod"}`;
}

function getCachedSession(username: string, isTest: boolean): string | null {
  const key = getCacheKey(username, isTest);
  const entry = sessionCache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    sessionCache.delete(key);
    return null;
  }
  return entry.sessionId;
}

function setCachedSession(username: string, isTest: boolean, sessionId: string): void {
  sessionCache.set(getCacheKey(username, isTest), {
    sessionId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
}

// ==================== XML HELPERS ====================

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getEndpoint(isTest: boolean): string {
  return isTest
    ? "https://efatura-test.uyumsoft.com.tr/services/Integration"
    : "https://efatura.uyumsoft.com.tr/services/Integration";
}

async function soapRequest(endpoint: string, soapAction: string, body: string): Promise<string> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: soapAction,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SOAP request failed (${res.status}): ${text.substring(0, 500)}`);
  }

  return res.text();
}

function extractTagValue(xml: string, tag: string): string | null {
  const patterns = [
    new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"),
    new RegExp(`<[^:]+:${tag}[^>]*>([^<]*)</[^:]+:${tag}>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function roundTwo(n: number): number {
  return Math.round(n * 100) / 100;
}

// ==================== CORE FUNCTIONS ====================

async function login(creds: InvoiceCredentials): Promise<string> {
  const username = creds.uyumsoft_username;
  const password = creds.uyumsoft_password;
  const isTest = creds.uyumsoft_is_test === "true";

  const cached = getCachedSession(username, isTest);
  if (cached) return cached;

  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:int="http://tempuri.org/IIntegration">
  <soap:Body>
    <int:Login>
      <int:userName>${escapeXml(username)}</int:userName>
      <int:password>${escapeXml(password)}</int:password>
    </int:Login>
  </soap:Body>
</soap:Envelope>`;

  const response = await soapRequest(
    getEndpoint(isTest),
    "http://tempuri.org/IIntegration/Login",
    envelope
  );

  const sessionId = extractTagValue(response, "LoginResult")
    || extractTagValue(response, "SessionId");

  if (!sessionId) {
    const faultString = extractTagValue(response, "faultstring");
    throw new Error(`Uyumsoft login basarisiz: ${faultString || "SessionId bulunamadi"}`);
  }

  setCachedSession(username, isTest, sessionId);
  return sessionId;
}

function buildUblTrXml(creds: InvoiceCredentials, invoice: InvoiceRequest): string {
  const invoiceId = `INV${Date.now()}`;
  const dateStr = invoice.orderDate.split("T")[0];
  const timeStr = new Date().toISOString().split("T")[1].substring(0, 8);
  const currency = invoice.currency || "TRY";

  let subtotal = 0;
  let taxTotal = 0;

  const lineXmls: string[] = [];

  for (let i = 0; i < invoice.items.length; i++) {
    const item = invoice.items[i];
    const lineExtension = roundTwo(item.quantity * item.unitPrice);
    const lineTax = roundTwo(lineExtension * item.vatRate / 100);
    subtotal += lineExtension;
    taxTotal += lineTax;

    lineXmls.push(`
    <cac:InvoiceLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="C62">${item.quantity}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${escapeXml(currency)}">${lineExtension.toFixed(2)}</cbc:LineExtensionAmount>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${escapeXml(currency)}">${lineTax.toFixed(2)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="${escapeXml(currency)}">${lineExtension.toFixed(2)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="${escapeXml(currency)}">${lineTax.toFixed(2)}</cbc:TaxAmount>
          <cbc:Percent>${item.vatRate}</cbc:Percent>
          <cac:TaxCategory>
            <cac:TaxScheme>
              <cbc:ID>0015</cbc:ID>
              <cbc:Name>KDV</cbc:Name>
              <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
            </cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Name>${escapeXml(item.name)}</cbc:Name>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${escapeXml(currency)}">${item.unitPrice.toFixed(2)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`);
  }

  const grandTotal = roundTwo(subtotal + taxTotal);

  const taxByRate = new Map<number, { taxable: number; tax: number }>();
  for (const item of invoice.items) {
    const lineExtension = roundTwo(item.quantity * item.unitPrice);
    const lineTax = roundTwo(lineExtension * item.vatRate / 100);
    const existing = taxByRate.get(item.vatRate) || { taxable: 0, tax: 0 };
    existing.taxable += lineExtension;
    existing.tax += lineTax;
    taxByRate.set(item.vatRate, existing);
  }

  const taxSubtotalsXml = Array.from(taxByRate.entries())
    .map(([rate, amounts]) => `
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${escapeXml(currency)}">${amounts.taxable.toFixed(2)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${escapeXml(currency)}">${amounts.tax.toFixed(2)}</cbc:TaxAmount>
        <cbc:Percent>${rate}</cbc:Percent>
        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:ID>0015</cbc:ID>
            <cbc:Name>KDV</cbc:Name>
            <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>`)
    .join("");

  const sellerVkn = creds.uyumsoft_vkn || "";
  const sellerName = creds.uyumsoft_company_name || "";
  const sellerAddress = creds.uyumsoft_address || "";
  const sellerCity = creds.uyumsoft_city || "";

  const buyerVkn = invoice.customerTaxId || "11111111111";
  const buyerScheme = buyerVkn.length === 11 ? "TCKN" : "VKN";

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
    <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
    <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
    <cbc:ProfileID>TEMELFATURA</cbc:ProfileID>
    <cbc:ID>${escapeXml(invoiceId)}</cbc:ID>
    <cbc:CopyIndicator>false</cbc:CopyIndicator>
    <cbc:IssueDate>${dateStr}</cbc:IssueDate>
    <cbc:IssueTime>${timeStr}</cbc:IssueTime>
    <cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>
    <cbc:DocumentCurrencyCode>${escapeXml(currency)}</cbc:DocumentCurrencyCode>
    <cac:AccountingSupplierParty>
      <cac:Party>
        <cac:PartyIdentification>
          <cbc:ID schemeID="VKN">${escapeXml(sellerVkn)}</cbc:ID>
        </cac:PartyIdentification>
        <cac:PartyName>
          <cbc:Name>${escapeXml(sellerName)}</cbc:Name>
        </cac:PartyName>
        <cac:PostalAddress>
          <cbc:StreetName>${escapeXml(sellerAddress)}</cbc:StreetName>
          <cbc:CityName>${escapeXml(sellerCity)}</cbc:CityName>
          <cac:Country>
            <cbc:Name>Turkiye</cbc:Name>
          </cac:Country>
        </cac:PostalAddress>
      </cac:Party>
    </cac:AccountingSupplierParty>
    <cac:AccountingCustomerParty>
      <cac:Party>
        <cac:PartyIdentification>
          <cbc:ID schemeID="${buyerScheme}">${escapeXml(buyerVkn)}</cbc:ID>
        </cac:PartyIdentification>
        <cac:PartyName>
          <cbc:Name>${escapeXml(invoice.customerName)}</cbc:Name>
        </cac:PartyName>
        <cac:PostalAddress>
          <cbc:StreetName>${escapeXml(invoice.customerAddress || "")}</cbc:StreetName>
          <cbc:CityName>${escapeXml(invoice.customerCity || "")}</cbc:CityName>
          <cac:Country>
            <cbc:Name>Turkiye</cbc:Name>
          </cac:Country>
        </cac:PostalAddress>
      </cac:Party>
    </cac:AccountingCustomerParty>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${escapeXml(currency)}">${taxTotal.toFixed(2)}</cbc:TaxAmount>${taxSubtotalsXml}
    </cac:TaxTotal>
    <cac:LegalMonetaryTotal>
      <cbc:LineExtensionAmount currencyID="${escapeXml(currency)}">${subtotal.toFixed(2)}</cbc:LineExtensionAmount>
      <cbc:TaxExclusiveAmount currencyID="${escapeXml(currency)}">${subtotal.toFixed(2)}</cbc:TaxExclusiveAmount>
      <cbc:TaxInclusiveAmount currencyID="${escapeXml(currency)}">${grandTotal.toFixed(2)}</cbc:TaxInclusiveAmount>
      <cbc:PayableAmount currencyID="${escapeXml(currency)}">${grandTotal.toFixed(2)}</cbc:PayableAmount>
    </cac:LegalMonetaryTotal>${lineXmls.join("")}
</Invoice>`;
}

// ==================== ADAPTER ====================

export class UyumsoftAdapter implements InvoiceAdapter {
  name = "uyumsoft" as const;

  async testConnection(creds: InvoiceCredentials): Promise<{ success: boolean; error?: string }> {
    try {
      if (!creds.uyumsoft_username || !creds.uyumsoft_password) {
        return { success: false, error: "Kullanici adi ve sifre gerekli" };
      }
      await login(creds);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Baglanti hatasi";
      return { success: false, error: message };
    }
  }

  async createInvoice(creds: InvoiceCredentials, invoice: InvoiceRequest): Promise<InvoiceResult> {
    try {
      const sessionId = await login(creds);
      const isTest = creds.uyumsoft_is_test === "true";
      const invoiceXml = buildUblTrXml(creds, invoice);
      const b64Xml = Buffer.from(invoiceXml, "utf-8").toString("base64");

      const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:int="http://tempuri.org/IIntegration">
  <soap:Body>
    <int:SendInvoice>
      <int:sessionId>${escapeXml(sessionId)}</int:sessionId>
      <int:invoices>
        <int:InvoiceInfo>
          <int:Invoice>${b64Xml}</int:Invoice>
          <int:LocalDocumentId>DOC${Date.now()}</int:LocalDocumentId>
        </int:InvoiceInfo>
      </int:invoices>
    </int:SendInvoice>
  </soap:Body>
</soap:Envelope>`;

      const response = await soapRequest(
        getEndpoint(isTest),
        "http://tempuri.org/IIntegration/SendInvoice",
        envelope
      );

      const faultString = extractTagValue(response, "faultstring");
      if (faultString) {
        return { success: false, error: faultString };
      }

      const isSuccessful =
        extractTagValue(response, "IsSuccessful") === "true" ||
        extractTagValue(response, "Successful") === "true";

      const invoiceId =
        extractTagValue(response, "InvoiceId") ||
        extractTagValue(response, "ID") ||
        extractTagValue(response, "Value");

      const errorMessage = extractTagValue(response, "Message")
        || extractTagValue(response, "ErrorMessage");

      if (!isSuccessful && errorMessage) {
        return { success: false, error: errorMessage };
      }

      return {
        success: true,
        externalId: invoiceId || undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Fatura olusturma hatasi";
      return { success: false, error: message };
    }
  }

  async cancelInvoice(creds: InvoiceCredentials, externalId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionId = await login(creds);
      const isTest = creds.uyumsoft_is_test === "true";

      const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:int="http://tempuri.org/IIntegration">
  <soap:Body>
    <int:CancelInvoice>
      <int:sessionId>${escapeXml(sessionId)}</int:sessionId>
      <int:invoiceId>${escapeXml(externalId)}</int:invoiceId>
    </int:CancelInvoice>
  </soap:Body>
</soap:Envelope>`;

      const response = await soapRequest(
        getEndpoint(isTest),
        "http://tempuri.org/IIntegration/CancelInvoice",
        envelope
      );

      const faultString = extractTagValue(response, "faultstring");
      if (faultString) {
        return { success: false, error: faultString };
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Fatura iptal hatasi";
      return { success: false, error: message };
    }
  }
}
