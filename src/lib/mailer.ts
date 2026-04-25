interface EmailResult {
  success: boolean;
  error?: string;
}

/**
 * Send a stock change / low stock email notification.
 * Uses a simple fetch to a transactional email API (e.g. Resend, Postmark).
 * Falls back to console.warn when not configured.
 */
export async function sendStockChangeEmail(params: {
  to: string;
  shopDomain: string;
  productTitle: string;
  variantTitle: string;
  marketplace: string;
  currentStock: number;
  threshold: number;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || "noreply@bayiportal.com";

  if (!apiKey) {
    console.warn("[mailer] RESEND_API_KEY not configured, skipping email");
    return { success: false, error: "Email service not configured" };
  }

  if (!params.to) {
    return { success: false, error: "No recipient email" };
  }

  const isZero = params.currentStock <= 0;
  const subject = isZero
    ? `[BayiPortal] Stok Tukendi: ${params.productTitle}`
    : `[BayiPortal] Dusuk Stok Uyarisi: ${params.productTitle}`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${isZero ? "#dc2626" : "#f59e0b"};">
        ${isZero ? "Stok Tukendi" : "Dusuk Stok Uyarisi"}
      </h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Magaza</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${params.shopDomain}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Urun</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${params.productTitle}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Varyant</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${params.variantTitle}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Pazar Yeri</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${params.marketplace}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Mevcut Stok</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${params.currentStock}</td></tr>
        <tr><td style="padding: 8px;"><strong>Esik Degeri</strong></td><td style="padding: 8px;">${params.threshold}</td></tr>
      </table>
    </div>
  `.trim();

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [params.to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { success: false, error: `Resend API ${res.status}: ${body}` };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
