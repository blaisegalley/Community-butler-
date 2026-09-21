import { webpush } from './deps.ts';
import { serviceClient } from './supabase.ts';

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Where tapping the notification should open. */
  url: string;
  /** Notifications sharing a tag replace each other instead of stacking. */
  tag?: string;
}

function configure(): boolean {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:thecommunitybutler@gmail.com';
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

/**
 * Delivers `message` to every subscription given.
 *
 * Subscriptions die silently — the browser is uninstalled, the app is
 * removed from the home screen, the push service rotates the endpoint.
 * The push service reports that as 404 or 410, and those rows are deleted
 * here. Left alone they accumulate forever and every send gets slower.
 */
export async function sendPush(
  subscriptions: PushSubscriptionRow[],
  message: PushMessage,
): Promise<{ sent: number; failed: number; expired: number }> {
  if (!subscriptions.length) return { sent: 0, failed: 0, expired: 0 };
  if (!configure()) {
    console.error('VAPID keys are not set — skipping push.');
    return { sent: 0, failed: subscriptions.length, expired: 0 };
  }

  const payload = JSON.stringify(message);
  const expired: string[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent += 1;
      } catch (cause) {
        const status = (cause as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          expired.push(sub.id);
        } else {
          failed += 1;
          console.error('Push failed', status, (cause as Error).message);
        }
      }
    }),
  );

  if (expired.length) {
    await serviceClient().from('push_subscriptions').delete().in('id', expired);
  }

  return { sent, failed, expired: expired.length };
}
