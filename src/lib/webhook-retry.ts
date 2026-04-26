import { db } from "./db";
import { syncLogs } from "./schema";
import { eq, and, lte } from "drizzle-orm";

const MAX_RETRIES = 3;

// Exponential backoff intervals in milliseconds
const BACKOFF_INTERVALS = [
  1 * 60 * 1000,   // 1 minute after 1st failure
  5 * 60 * 1000,   // 5 minutes after 2nd failure
  30 * 60 * 1000,  // 30 minutes after 3rd failure
];

interface WebhookDetails {
  topic: string;
  body: string;
  error: string;
  retryCount: number;
  lastAttemptAt: string;
}

/**
 * Store a failed webhook in syncLogs for later retry.
 */
export async function queueFailedWebhook(
  tenantId: number,
  topic: string,
  body: string,
  error: string
): Promise<void> {
  const details: WebhookDetails = {
    topic,
    body,
    error,
    retryCount: 0,
    lastAttemptAt: new Date().toISOString(),
  };

  await db.insert(syncLogs).values({
    shopId: tenantId,
    type: "shopify_webhook",
    marketplace: "shopify",
    summary: `Failed webhook: ${topic}`,
    details,
    status: "error",
    errorMessage: error,
  });
}

/**
 * Retry failed webhooks that are due for retry based on exponential backoff.
 * Returns counts of retried, succeeded, and failed webhooks.
 */
export async function retryFailedWebhooks(): Promise<{
  retried: number;
  succeeded: number;
  failed: number;
}> {
  const result = { retried: 0, succeeded: 0, failed: 0 };

  // Get all failed webhook logs
  const failedWebhooks = await db
    .select()
    .from(syncLogs)
    .where(
      and(
        eq(syncLogs.type, "shopify_webhook"),
        eq(syncLogs.status, "error")
      )
    );

  const now = Date.now();

  for (const log of failedWebhooks) {
    const details = log.details as WebhookDetails | null;
    if (!details?.body || !details?.topic) continue;

    const retryCount = details.retryCount ?? 0;

    // Max retries exceeded — mark as permanently failed
    if (retryCount >= MAX_RETRIES) {
      try {
        await db
          .update(syncLogs)
          .set({
            status: "failed_permanent" as string,
            errorMessage: `Permanently failed after ${MAX_RETRIES} retries: ${details.error}`,
          })
          .where(eq(syncLogs.id, log.id));
      } catch {
        // Non-critical
      }
      continue;
    }

    // Check backoff: is enough time passed since last attempt?
    const lastAttempt = new Date(details.lastAttemptAt).getTime();
    const requiredDelay = BACKOFF_INTERVALS[retryCount] ?? BACKOFF_INTERVALS[BACKOFF_INTERVALS.length - 1];

    if (now - lastAttempt < requiredDelay) {
      continue; // Not ready for retry yet
    }

    result.retried++;

    try {
      // Re-process the webhook by importing the handler
      const { processWebhookRetry } = await import("./webhook-processor");
      await processWebhookRetry(log.shopId, details.topic, details.body);

      // Mark as succeeded
      await db
        .update(syncLogs)
        .set({
          status: "success",
          errorMessage: null,
          details: {
            ...details,
            retryCount: retryCount + 1,
            lastAttemptAt: new Date().toISOString(),
            retriedSuccessfully: true,
          },
        })
        .where(eq(syncLogs.id, log.id));

      result.succeeded++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      // Update retry count and last attempt
      await db
        .update(syncLogs)
        .set({
          errorMessage: errorMsg,
          details: {
            ...details,
            retryCount: retryCount + 1,
            lastAttemptAt: new Date().toISOString(),
            error: errorMsg,
          },
        })
        .where(eq(syncLogs.id, log.id));

      result.failed++;
    }
  }

  return result;
}
