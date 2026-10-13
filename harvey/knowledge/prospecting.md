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

**Track A (moving help): businesses that need small and medium furniture moves**
in the same towns. These are Butler jobs like chairs, desks, side tables,
dressers and boxes: a few pieces, not a whole house. Look for:
- Home stagers and professional organizers (staging days mean carrying furniture).
- Office furniture dealers and small offices (desks and chairs moved between rooms, old chairs cleared out). Pitch the small jobs their install crews skip.
- Furniture stores where customers pick up their own orders (help carrying it in at home).
- Estate sale companies (carry-out help for buyers, setup before a sale).
- Furniture consignment and resale shops (buyers need help getting pieces home).
- Interior designers who rearrange existing furniture.
- Sources: the Barrington, Palatine and Arlington Heights chamber directories ("Home & Garden", "Shopping & Specialty Retail", "Real Estate, Moving & Storage", "Business & Professional Services"), plus estatesales.org for estate sale companies.
- Skip moving companies, senior move managers that run their own crews, and stores that already deliver everywhere. They're competitors, not customers.
- Never promise to drive furniture anywhere. Pitch carrying, loading, unloading and setting pieces in place. Butlers do small and medium jobs; anything bigger belongs with a moving company (see competitive_intel.md).

Each run, aim for roughly a third agents, a third moving-help businesses and a
third Track B websites, unless Blaise asks for something else.

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

## Phone numbers

- Record the phone number the business or agent publishes for customers: on their own site (a `tel:` link or the contact page), their brokerage profile, or their chamber listing. For agents, the number on their own site is their business line even when it's a cell.
- Never look up home numbers or use people-search or paid lookup sites.
- Write it as (847) 555-0123.
- Prospects with a phone but no email are still worth recording (status `skip`, note "call or visit"). Those are Blaise's call list.

## What to record (one Desk prospect per person or business)

| field | what goes in it |
|---|---|
| `track` | `A` or `B` |
| `business` | brokerage or business name |
| `contact_name` | person's name if published, else empty |
| `role` | e.g. "Realtor", "Owner" |
| `email` / `email_source` | the address and the URL it was published on |
| `phone` / `phone_source` | the business phone they publish and the URL it's on, so Blaise can call. Record it even when there's no email |
| `website` | their site, if any |
| `town` | e.g. "Palatine" |
| `signal` | the specific, true reason Harvey picked them. It stays on the Desk for Blaise; the email only alludes to it in general terms (see writing.md) |
| `signal_source` | the URL that shows it |
| `status` | `new` |
| `notes` | anything Blaise should know; keep it short and factual |

Write facts about businesses, not opinions about people. The Desk is private,
but write every note as if the prospect might read it someday.
