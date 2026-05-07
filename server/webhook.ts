/**
 * Webhook delivery for scheduled runs.
 *
 * Posts result JSON to a webhook URL with a single retry on failure.
 * Timeouts after 10 seconds. Logs failures as structured events.
 */

export interface WebhookPayload {
  event: 'scheduled_run'
  run_id: string
  alias: string
  status: string
  result: unknown
  run_at: string
  webhook_id: string
}

function makeWebhookId(): string {
  return `wh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export async function sendWebhook(url: string, payload: Omit<WebhookPayload, 'webhook_id'>): Promise<{ ok: true } | { ok: false; error: string }> {
  const webhookPayload: WebhookPayload = { ...payload, webhook_id: makeWebhookId() }

  const attempt = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'junction-box-scheduler/1.0',
        },
        body: JSON.stringify(webhookPayload),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (response.ok) {
        return { ok: true }
      }
      return { ok: false, error: `HTTP ${response.status} ${response.statusText}` }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  const first = await attempt()
  if (first.ok) return first

  // Single retry with 5s delay
  await Bun.sleep(5000)
  const second = await attempt()
  if (second.ok) return second

  return { ok: false, error: `${first.error} (retry: ${second.error})` }
}
