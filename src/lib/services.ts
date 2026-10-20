// A season contract is snow shoveling sold by the winter rather than by the
// storm. It gets its own label so a manager can tell the two apart, but a
// Butler who prefers "Snow shoveling" is just as much a match for it.
export const SNOW_SEASON = 'Snow shoveling (whole season)';

// Lets a link such as /request?service=snow-season open the form with the
// season contract already chosen, which is what the Instagram DM sends.
export const SERVICE_LINKS: Record<string, string> = {
  'snow-season': SNOW_SEASON,
};

export function matchesPrefs(prefs: string[], service: string): boolean {
  return prefs.includes(service === SNOW_SEASON ? 'Snow shoveling' : service);
}
