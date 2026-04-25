const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

interface TelegramSendResult {
  success: boolean;
  error?: string;
}

/**
 * Send a message via Telegram Bot API.
 */
async function sendTelegramMessage(chatId: string, text: string): Promise<TelegramSendResult> {
  if (!TELEGRAM_BOT_TOKEN || !chatId) {
    return { success: false, error: "Telegram not configured" };
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
        }),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      return { success: false, error: `Telegram API ${res.status}: ${body}` };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Notify about low/zero stock for a product variant.
 */
export async function notifyLowStock(params: {
  shopDomain: string;
  productTitle: string;
  variantTitle: string;
  marketplace: string;
  currentStock: number;
  threshold: number;
  chatId?: string;
}): Promise<TelegramSendResult> {
  const {
    shopDomain,
    productTitle,
    variantTitle,
    marketplace,
    currentStock,
    threshold,
    chatId,
  } = params;

  const isZero = currentStock <= 0;
  const emoji = isZero ? "🚨" : "⚠️";
  const statusText = isZero ? "STOK TUKENDI" : "DUSUK STOK";

  const message = [
    `${emoji} <b>${statusText}</b>`,
    ``,
    `<b>Magaza:</b> ${shopDomain}`,
    `<b>Urun:</b> ${productTitle}`,
    `<b>Varyant:</b> ${variantTitle}`,
    `<b>Pazar Yeri:</b> ${marketplace}`,
    `<b>Mevcut Stok:</b> ${currentStock}`,
    `<b>Esik Degeri:</b> ${threshold}`,
  ].join("\n");

  return sendTelegramMessage(chatId || TELEGRAM_CHAT_ID, message);
}
