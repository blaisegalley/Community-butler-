# Finding and qualifying prospects

Harvey finds a small batch of good prospects each run (default 10, set in
`harvey.yaml` as `usage.max_new_prospects_per_run`). Ten researched prospects
beat a hundred scraped ones.

## Where to look

Use web search and read the pages themselves. Only free, public sources.

**Track A: real estate agents** in Barrington, Arlington Heights, Palatine,
Lake Zurich, Inverness, Hoffman Estates, Deer Park, Lake Barrington, South
Barrington and nearby.
- Brokerage office pages that list their agents (each agent usually has a profile with an email).
- Agents' own websites and their current listings.
- Recent listings in those towns: the listing page names the agent.
- Good signals: an active listing (especially vacant, estate or "as-is"), a listing with a visible yard or long driveway, a new listing coming into fall or winter, an agent who clearly works these specific towns.

**Track B: small local businesses** in the same towns.
- Map listings, the local chamber of commerce member directory, village business directories.
- Good signals (state only what you actually saw):
  - No website at all, just a listing or a social page.
  - A site that is broken on a phone, very slow, or only a PDF menu.
  - An old copyright year in the footer, or "Under construction".
  - No way to book or ask for a quote online when competitors have one.
- Owner-run places: salons, cafes, restaurants, boutiques, contractors, landscapers, auto shops, studios, cleaners.

## Who to skip

- Big chains and franchises with a corporate website.
- Anyone already in the Desk pipeline (check by email and by business name).
- Anyone on the opt-out list. Never re-add them, even at a new address.
- Businesses whose site was clearly built recently and works well. Don't invent a problem.
- For Track B: web designers, marketing agencies, and anyone who sells websites.
- For Track A: anyone outside the service area.
- Anyone where you can't name a specific, true reason to email them. No signal, no email.

## Email addresses

- Use only an address the business or agent publishes themselves: on their own website, their brokerage profile, or their official listing. Record the page you found it on as `email_source`.
- Never guess an address from a pattern (firstname@...), never use a paid lookup, never scrape personal (non-business) addresses.
- A general business inbox (info@, hello@) is fine for Track B.
- If there's only a contact form, add the prospect with no email and status `skip`, note "contact form only" so Blaise can decide.

## What to record (one Desk prospect per person or business)

| field | what goes in it |
|---|---|
| `track` | `A` or `B` |
| `business` | brokerage or business name |
| `contact_name` | person's name if published, else empty |
| `role` | e.g. "Realtor", "Owner" |
| `email` / `email_source` | the address and the URL it was published on |
| `website` | their site, if any |
| `town` | e.g. "Palatine" |
| `signal` | the specific, true reason Harvey picked them. It stays on the Desk for Blaise; the email only alludes to it in general terms (see writing.md) |
| `signal_source` | the URL that shows it |
| `status` | `new` |
| `notes` | anything Blaise should know; keep it short and factual |

Write facts about businesses, not opinions about people. The Desk is private,
but write every note as if the prospect might read it someday.
