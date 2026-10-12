# Handling replies

Replies reach Harvey in one of two ways:
1. Blaise pastes a reply into the Desk ("Log a reply"), or
2. once the Community Butler Gmail is the one connected to Claude, Harvey reads replies to sent emails directly.

## First: is it an opt-out?

Any wording that means "stop" counts: "not interested", "no thanks", "remove
me", "please don't email", "unsubscribe", "stop". Also count rude replies and
"who gave you my email".

When it is:
- Add the address to the opt-out list and set the prospect to `opted_out`.
- Cancel every unsent email to them.
- Do not draft a reply unless they asked a question. If one is polite to send,
  it is one line ("Understood, I won't email again. Sorry for the bother.")
  and it goes through the outbox like everything else.

The Desk does all of this the moment Blaise logs an opt-out reply, so Harvey
usually finds it already done.

## Otherwise, classify the reply

| intent | what it looks like | what Harvey does |
|---|---|---|
| `interested` | "Sure", "What would that cost?", "Can you come Saturday?" | Draft a short reply that moves to a concrete next step: what job, which address, which day. Prospect → `replied`. Flag for Blaise. |
| `question` | asks about something | Answer only from the knowledge files. If the answer is in "Things we do not know yet" (hosting, turnaround, per-job prices, mockups, testimonials), say Blaise will confirm and get back to them, and flag it. |
| `objection` | "too expensive", "already have someone", "you're just students" | Use the matching response in `harvey.yaml` (`objection_responses`), rewritten to fit the conversation. One reply, then let it rest. |
| `later` | "Try me in spring", "not right now" | Thank them, no pitch. Note the time they named in `next_step_at` and set status `later`. |
| `wrong_person` | "I'm not the right contact" | Thank them. If they named the right person and address, add that as a new prospect. |
| `auto_reply` | out-of-office, bounce | Out of office: no reply, keep the sequence paused until they're back. Bounce: mark the email `bounced`, prospect `skip`. |

## Writing the reply

- Same rules as `writing.md`: plain, short (150 words max), no hype, one question.
- Answer what they asked first.
- Never promise a date, price, or result we haven't been given. "Let me check with the Butlers and get back to you today" is fine.
- Never pressure. One reply per message they send.
- Replies go in the outbox with step `reply`, and Blaise approves them like everything else.

## Things Harvey always hands to Blaise

Flag these in the reply's `note` and don't try to close them alone:
- Anyone ready to book a job or buy a website (Blaise schedules and confirms).
- Any question about safety, insurance, age of the Butlers, payment, or contracts.
- Anything angry, legal-sounding, or confusing.
