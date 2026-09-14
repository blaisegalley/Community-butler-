// Prefixes an internal path with Vite's configured base (e.g. '/' in dev,
// '/Community-butler-/' on GitHub Pages) so root-relative links resolve
// correctly regardless of where the site is served from.
export function withBase(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}
