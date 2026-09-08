/*
 * Part 5 (optional) — scheduled trigger checks: weather-based snow shoveling
 * drafts and calendar-based seasonal drafts. Both return *proposed* drafts
 * only; nothing here posts anything or writes to content_queue — the admin
 * dashboard (which owns the content_queue, stored client-side per store.ts'
 * MVP design) inserts them as `pending_review` and a human still has to
 * approve before anything goes out. See README.md for the "real cron"
 * upgrade path once there's a shared backend database.
 */

const BARRINGTON_LAT = process.env.WEATHER_LAT || '42.1531';
const BARRINGTON_LON = process.env.WEATHER_LON || '-88.1342';
const SNOW_THRESHOLD_MM = Number(process.env.SNOW_THRESHOLD_MM || 20);

export async function checkWeatherTrigger() {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return { triggered: false, reason: 'OPENWEATHER_API_KEY not configured — skipping weather check.' };
  }

  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${BARRINGTON_LAT}&lon=${BARRINGTON_LON}&appid=${apiKey}&units=metric`;
  const res = await fetch(url);
  if (!res.ok) {
    return { triggered: false, reason: `OpenWeatherMap request failed (${res.status})` };
  }
  const data = await res.json();

  // 3-hour forecast slots; next 48h = next 16 slots.
  const next48h = (data.list || []).slice(0, 16);
  const totalSnowMm = next48h.reduce((sum, slot) => sum + (slot.snow?.['3h'] || 0), 0);

  if (totalSnowMm >= SNOW_THRESHOLD_MM) {
    return {
      triggered: true,
      reason: `${totalSnowMm.toFixed(1)}mm of snow forecast in the next 48h (threshold ${SNOW_THRESHOLD_MM}mm).`,
      theme: 'snow_shoveling',
      campaignSlug: 'snow_shoveling_seasonal',
      jobData: {
        service: 'Snow shoveling',
        details:
          'Snow in the forecast for Barrington over the next couple days — Butlers are booking up driveways and walkways.',
      },
    };
  }
  return { triggered: false, reason: `Only ${totalSnowMm.toFixed(1)}mm forecast — below the ${SNOW_THRESHOLD_MM}mm threshold.` };
}

// Calendar windows are deliberately narrow (one week) so a daily check fires
// the draft once per season, not continuously — the client also dedupes by
// year via localStorage before inserting into content_queue.
export function checkCalendarTriggers(now = new Date()) {
  const month = now.getMonth(); // 0-indexed
  const day = now.getDate();
  const triggers = [];

  if (month === 4 && day <= 7) {
    // First week of May
    triggers.push({
      theme: 'yard_cleanup',
      campaignSlug: 'spring_cleanup',
      reason: 'First week of May — spring yard cleanup season.',
      jobData: {
        service: 'Yard work',
        details: 'Spring cleanup season is here — raking, mulching, and getting yards ready for summer.',
      },
    });
  }

  if (month === 7 && day >= 20) {
    // Late August
    triggers.push({
      theme: 'move_out_hauling',
      campaignSlug: 'move_out_hauling',
      reason: 'Late August — move-out and dorm/apartment hauling season.',
      jobData: {
        service: 'Junk hauling',
        details: 'Move-out season — hauling boxes, furniture, and junk for people heading out or downsizing.',
      },
    });
  }

  return triggers;
}
