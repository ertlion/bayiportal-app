export type InvoiceProvider = "uyumsoft" | "parasut" | "logo" | "elogo" | "kolaybi";

export interface InvoiceCredentials {
  [key: string]: string;
}

export interface InvoiceItem {
  name: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  totalPrice: number;
}

export interface InvoiceRequest {
  customerName: string;
  customerTaxId?: string;
  customerTaxOffice?: string;
  customerAddress?: string;
  customerCity?: string;
  items: InvoiceItem[];
  totalAmount: number;
  currency: string;
  orderNumber: string;
  orderDate: string;
}

export interface InvoiceResult {
  success: boolean;
  externalId?: string;
  pdfUrl?: string;
  error?: string;
}

export interface InvoiceAdapter {
  name: InvoiceProvider;
  testConnection(creds: InvoiceCredentials): Promise<{ success: boolean; error?: string }>;
  createInvoice(creds: InvoiceCredentials, invoice: InvoiceRequest): Promise<InvoiceResult>;
  cancelInvoice?(creds: InvoiceCredentials, externalId: string): Promise<{ success: boolean; error?: string }>;
  getInvoicePdf?(creds: InvoiceCredentials, externalId: string): Promise<{ success: boolean; pdfUrl?: string; error?: string }>;
}
