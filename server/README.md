# Community Butler — marketing server

Small backend for the admin Marketing tab. It exists for one reason: the
Anthropic and Meta Graph API calls need secret credentials, and the rest of
this repo is a static site with no backend (see `src/lib/store.ts`'s header
comment) — those secrets can never live in client-side code. This service is
additive; it doesn't touch the static site's job/Butler data, which stays in
the browser's localStorage as before.

## Endpoints

- `POST /api/marketing/generate-captions` `{ job, platform }` → `{ drafts: [string, string] }`
  Calls the Anthropic API (Part 2 of the feature spec).
- `POST /api/marketing/publish` `{ platform: 'instagram'|'facebook', caption, imageUrl? }` → `{ success, postId }` or `{ success: false, error }`
  Calls the Meta Graph API (Part 4). Nextdoor is never sent here — there is no
  public Nextdoor posting API, so Nextdoor content stays a manual copy/paste
  staging card in the admin UI.
- `GET /api/marketing/seasonal-check` → `{ triggers: [...] }`
  Optional Part 5: reports whether today trips the snow-forecast or
  calendar-based seasonal triggers. Stateless — the admin dashboard decides
  whether it's already drafted that trigger this season and inserts into its
  own content queue.

## Running it

```bash
cd server
npm install
cp .env.example .env   # fill in the values below
npm start               # listens on :8787 by default
```

Point the frontend at it by setting `VITE_MARKETING_API_BASE` (e.g.
`http://localhost:8787`) when running the Vite dev server / build — see the
root project's `.env.example`.

## Setup prerequisites — please read before expecting this to work

### Anthropic API (captions)

Just needs `ANTHROPIC_API_KEY`. Nothing else required.

### Meta Graph API (publishing) — **not configured out of the box**

Publishing to Instagram/Facebook requires, before a single post will succeed:

1. A **Meta Developer app** at developers.facebook.com.
2. A **Facebook Page**, with an **Instagram Business (or Creator) account**
   linked to it.
3. **App review** approval for the `pages_manage_posts` and
   `instagram_content_publish` permissions (Instagram publishing also needs
   `instagram_basic` and `pages_read_engagement`). Meta reviews these
   manually — this is not instant.
4. A **long-lived Page access token** and the linked **Instagram user id**,
   set as `META_ACCESS_TOKEN`, `META_PAGE_ID`, `META_IG_USER_ID`.

Until all four are in place, `/api/marketing/publish` will return a clear
error (surfaced in the admin UI, entry stays "approved" so it can be
retried) rather than pretending to succeed.

Instagram's API has no text-only post type — a post needs an image. If a
content_queue entry has no job photo attached, Instagram publishing will
fail with an explicit error; Facebook will still post as a text-only feed
post.

### OpenWeatherMap (optional, Part 5 only)

Free-tier API key at openweathermap.org. Without `OPENWEATHER_API_KEY` set,
the snow-forecast trigger just reports itself as not triggered — the
calendar-based seasonal triggers still work without it.

## On the "daily scheduled job" in Part 5

This server has no database and the content queue lives in the admin's
browser (localStorage), so there's nowhere server-side to persist "already
drafted this season." The pragmatic MVP version implemented here: the admin
dashboard calls `GET /api/marketing/seasonal-check` once per day (deduped by
date in localStorage) when the Marketing tab is open, and inserts any
returned trigger into its own content queue as `pending_review`. Everything
still requires human approval before it schedules or posts anything.

For a true unattended daily cron (fires even if nobody has the admin tab
open), stand up a real database, move content_queue there, and add a
`cron`/scheduled-function trigger that calls the same `checkWeatherTrigger` /
`checkCalendarTriggers` logic in `src/seasonal.js` and writes directly to
that database. That's a bigger infrastructure change than this feature adds
elsewhere, so it's left as the natural next step rather than done here.
