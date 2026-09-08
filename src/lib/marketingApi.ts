/*
 * Thin client for the marketing server (see /server) — the small backend
 * that holds the Anthropic and Meta Graph API secrets. Never call those
 * APIs directly from the browser; the keys can't live in client code.
 */

import { ContentPlatform } from '@/lib/contentQueue';
import { Job } from '@/lib/store';

const API_BASE = (import.meta.env.VITE_MARKETING_API_BASE as string | undefined) || 'http://localhost:8787';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || `Request to ${path} failed (${res.status})`);
  }
  return json as T;
}

export interface SyntheticJobData {
  service: string;
  details: string;
  address?: string;
}

// Real completed jobs and seasonal/weather template drafts both go through
// this same shape — the server just needs service/details/address.
export async function generateCaptionDrafts(
  job: Pick<Job, 'service' | 'details' | 'address'> | SyntheticJobData,
  platform: ContentPlatform,
): Promise<string[]> {
  const { drafts } = await post<{ drafts: string[] }>('/api/marketing/generate-captions', { job, platform });
  return drafts;
}

export interface PublishResult {
  success: boolean;
  postId?: string;
  error?: string;
}

export async function publishToMeta(
  platform: 'instagram' | 'facebook',
  caption: string,
  imageUrl?: string,
): Promise<PublishResult> {
  try {
    const result = await post<{ success: boolean; postId: string }>('/api/marketing/publish', {
      platform,
      caption,
      imageUrl,
    });
    return result;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Publish failed' };
  }
}

export interface SeasonalTrigger {
  theme: string;
  campaignSlug: string;
  reason: string;
  jobData: SyntheticJobData;
}

export async function fetchSeasonalTriggers(): Promise<SeasonalTrigger[]> {
  const res = await fetch(`${API_BASE}/api/marketing/seasonal-check`);
  if (!res.ok) return [];
  const json = await res.json().catch(() => ({ triggers: [] }));
  return json.triggers || [];
}
