/*
 * Part 5 (optional) — runs the seasonal/weather trigger check at most once
 * per calendar day (tracked in localStorage) and, for anything newly
 * triggered this season, drafts captions for all 3 platforms and inserts
 * them into the content queue as pending_review. Still requires human
 * approval before anything is scheduled or posted — this only proposes.
 */

import { read, write } from '@/lib/store';
import { fetchSeasonalTriggers, generateCaptionDrafts } from '@/lib/marketingApi';
import { addContentQueueEntry, ContentPlatform } from '@/lib/contentQueue';

const PLATFORMS: ContentPlatform[] = ['instagram', 'facebook', 'nextdoor'];
const STATE_KEY = 'cb.seasonalTriggerState.v1';

interface SeasonalState {
  lastCheckedDate: string; // yyyy-mm-dd
  firedThemes: string[]; // e.g. "yard_cleanup:2026" — dedupes within a season/year
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function themeKey(theme: string): string {
  return `${theme}:${new Date().getFullYear()}`;
}

// Call this from the Marketing tab on mount. No-ops (and returns quickly)
// if already checked today.
export async function runSeasonalCheckIfDue(): Promise<void> {
  const state = read<SeasonalState>(STATE_KEY, { lastCheckedDate: '', firedThemes: [] });
  if (state.lastCheckedDate === today()) return;

  let triggers;
  try {
    triggers = await fetchSeasonalTriggers();
  } catch {
    return; // server unreachable — just try again next time the tab opens
  }

  for (const trigger of triggers) {
    const key = themeKey(trigger.theme);
    if (state.firedThemes.includes(key)) continue;

    try {
      for (const platform of PLATFORMS) {
        const drafts = await generateCaptionDrafts(trigger.jobData, platform);
        addContentQueueEntry({ jobId: null, platform, captionDrafts: drafts, campaignSlug: trigger.campaignSlug });
      }
      state.firedThemes.push(key);
    } catch {
      // Leave it un-fired so it's retried the next time the tab opens today
      // or tomorrow, rather than silently losing the seasonal draft.
    }
  }

  state.lastCheckedDate = today();
  write(STATE_KEY, state);
}
