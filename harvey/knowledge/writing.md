# Writing the emails

Rules for every email Harvey drafts. Ideas adapted from the open-source Harvey
project's email playbook (github.com/ethanplusai/harvey, MIT license), cut down
for a student business emailing neighbors.

## The one rule

Write it the way Blaise would type it to someone in town. A high school student
who noticed something real, not a marketer. Read it out loud. If it sounds like
an ad, start over.

## Compliance comes first

These beat every style rule below.

- The subject tells the truth. No "Re:" or "Fwd:" on a first email, nothing implying you've talked before.
- The sender is real: Blaise Galley, Community Butler. Never pretend to be a customer, a neighbor who "happened to notice", or anyone else.
- The Desk adds the footer: Blaise's name and role, the website, the mailing address, and a line saying they can ask not to be emailed again. **Do not write a signature or sign-off line in the body.** End the body on the question.
- Anyone who says stop in any wording ("not interested", "remove me", "please don't email") is never emailed again. See `replies.md`.
- If someone asks whether a person or an AI wrote the email, say truthfully that Blaise uses an AI assistant to help draft emails and reads and sends every one personally. Never deny it.
- Plain text only. No links in email 1. At most one link in any later email.

## One track per email

Every prospect is Track A (real estate agent, Butler jobs) or Track B (small
business, website). Never mention the other track in the same email. An agent
email never mentions websites; a business email never mentions raking.

## Don't sound like you've been watching them

Blaise's rule: nobody should read the email and feel researched. The reason
Harvey picked someone stays on the Desk (the `signal`). The email only
alludes to it in general terms.

- **Agents:** talk about the towns they work in and the season ("yards around
  Inverness fill with leaves this time of year"). Never name a street
  address, a listing's status ("under contract", "just listed", "pending"),
  a sale, a price, or a blog post. Never congratulate anyone on anything.
- **Businesses:** the website problem *is* the pitch, so name it once, plainly,
  as something anyone would see ("isn't set up for phones yet"). One
  problem, not a list of everything wrong. Never quote old dates, typos or
  stale notices back at them.
- Never say "I saw", "I noticed", "I came across", "I read", "I was looking at".

## Shape of a first email (step 1, 75 words max)

1. One sentence about their world in general: their town, the season, the kind of homes they sell, or (for a business) the one website problem.
2. One sentence connecting it to one thing we do. Pick the single job that fits (and the season, see below).
3. One easy question they can answer in a few words.

Start with them, not "I" or "We". Name Community Butler at most once. Say you're a student at Barrington High when it helps the email feel local; it usually does.

Good easy questions: "Want me to send over what that would look like?" /
"Is that something you'd ever hand off?" / "Want a quick outline of what your site could be?"
Weak ones: "Worth a quick call?" / "Let me know if you're interested." / "Are you the right person?"

## Follow-ups

- **Step 2 (60 words max, 4 days after step 1 if no reply):** one new, useful angle. Not "just following up". A different job that fits, or a concrete detail (for a business: one thing their site would have). May include one link to thecommunitybutler.com (Track A only, since websites are not on the site).
- **Step 3 (40 words max, 7 days after step 2):** a short, polite last note. "I'll leave it here. If a yard ever needs a hand before a showing, you know where to find me." Then stop. No step 4.
- Any reply stops the sequence.
- Follow-ups reuse email 1's subject exactly, so they sit together in the prospect's inbox. Never add "Re:" yourself.

## Season (it matters for Track A)

- September to November: leaf raking and fall yard cleanup before photos and showings.
- December to March: snow shoveling for vacant or listed homes, walkways clear for showings.
- April to June: power washing (see the note in product_knowledge.md), weeding, mowing, yard prep.
- Any time: moving help, junk hauling and cleanouts for estate or vacant listings.
- Any time, for stagers, offices, furniture shops and estate sales: small and medium furniture moves (chairs, desks, dressers). Say "carry", "load" and "set in place", never "deliver" or "drive".

## Words and habits that never appear

The gate (`harvey/gate.mjs`) blocks the worst of these automatically. The rest are on you.

- Watching-you phrases: congrats, under contract, just listed, "I saw", "I noticed", "I came across", "I read your".
- Hype: revolutionary, game-changing, cutting-edge, leverage, synergy, unlock, supercharge.
- AI tells: "I hope this finds you well", "I wanted to reach out", "just following up", "circling back", "picture this", "imagine if", "in today's...".
- Em dashes. Use a period or a comma.
- More than one exclamation mark in a whole email. Zero is better.
- Bullets, bold, headers, emoji.
- More than one question.
- Prices on Track A. Prices outside $700 to $1,250 on Track B. Invented testimonials, customer counts, turnaround promises, or "guarantees".
- Placeholders like [First Name]. If you don't know their first name, write without one ("Hi there" or no greeting).

## Subject lines

Lowercase-ish, short, plain, under 60 characters: "fall cleanup for Inverness listings", "move-out help in Barrington", "a website that works on phones". No street addresses or listing details. Never clickbait, never all caps.

## Before an email goes in the outbox

Run every draft through the gate:

```bash
node harvey/gate.mjs '{"to":"...","subject":"...","body":"...","step":1,"track":"A","prospectEmail":"...","optedOut":[...]}'
```

If it fails, rewrite and run it again. Never put a failing email in the outbox.
