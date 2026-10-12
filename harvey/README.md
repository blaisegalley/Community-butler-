# Harvey

Community Butler's outreach assistant. Harvey finds local real estate agents and
small businesses, reads their pages, and writes short personal emails as Blaise:
Butler jobs for agents (Track A), websites for businesses (Track B). It also
drafts answers to replies and follow-ups.

**Harvey never sends anything.** Every email waits on the Harvey Desk until you
approve it, and then you send it yourself from Gmail.

Inspired by the open-source [Harvey](https://github.com/ethanplusai/harvey) sales
agent (MIT). That version is a Python program that runs on your own computer.
This one runs in Claude sessions, so nothing needs to stay switched on.

## How to use it

1. **Run it.** In a Claude Code session on this repo, say **"run Harvey"** (or `/harvey`).
   It answers new replies, writes due follow-ups, finds up to 10 new prospects,
   and writes a first email for each.
2. **Review on the Desk.** Open the [Harvey Desk](https://claude.ai/artifact/KmGNFz1CPHTcMG3Wqq12h7)
   (private to you). Each email shows who it's for, why Harvey picked them, and
   whether it passes the checks. Edit anything, then **Approve** or **Reject**.
   A rejection reason teaches Harvey for next time.
3. **Send.** On an approved email, **Open in Gmail** opens a filled-in message
   in the Community Butler Gmail account. Press send there, then **Mark as sent**
   on the Desk.
4. **Log replies.** When someone answers, paste their reply into the Desk's
   **Replies** tab. Their follow-ups stop right away, and Harvey drafts an
   answer on the next run. If they say stop in any form, they go on the
   opt-out list for good.

You can ask for just one part: "Harvey, only do replies", "find 5 agents in
Palatine", "write to Elm Street Bakery", "stop emailing jane@...".

## Before the first send

- **Mailing address.** US law (CAN-SPAM) requires a postal address in every sales
  email. A P.O. box works. Add it on the Desk under Settings. The Desk won't
  let you send until it's set.
- **Small batches.** The Desk allows 20 sends a day (change it in Settings).
  A new Gmail address that suddenly sends lots of cold email ends up in spam.
- **Quiet hours.** The Desk blocks sending between 9pm and 8am Chicago time.

## What's where

| path | what it is |
|---|---|
| `harvey.yaml` | Who Harvey writes as, what we sell, who we target, limits, the Desk link |
| `knowledge/product_knowledge.md` | What we offer and what we must not claim, including where the website disagrees |
| `knowledge/competitive_intel.md` | How we compare, without naming anyone |
| `knowledge/writing.md` | How the emails are written (length, tone, banned words, follow-up timing) |
| `knowledge/prospecting.md` | Where Harvey looks for prospects and who it skips |
| `knowledge/replies.md` | How replies and opt-outs are handled |
| `gate.mjs` | Fixed checks every email must pass (word limits, banned phrases, prices, placeholders, opt-outs). Run the tests with `npm run test:harvey` |
| `desk/index.html` | Source of the Harvey Desk page |
| `../.claude/skills/harvey/SKILL.md` | Harvey's step-by-step instructions |

Edit any of these and Harvey's next run behaves differently. The Desk loads its
checks from `gate.mjs`, so after changing that file, republish the Desk (ask
Claude to "republish the Harvey Desk") so they match.

## Privacy

This repository is public. Prospect names, emails, notes and replies live only
on the Desk, which only you can open. Don't paste them into files here.

## Optional: Gmail drafts and reply reading

If you connect the Community Butler Gmail account (thecommunitybutler@gmail.com)
to Claude, Harvey can also put approved emails in that account's Drafts and
find replies on its own. It checks which account is connected first and does
nothing with any other account.
