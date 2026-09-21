# Setting up notifications and emails

The app works right now without any of this — it just stores everything in
whatever browser it's open in. That's why nothing can be notified: a job a
neighbour posts on their phone never leaves their phone, so there is
nothing for a server to send an alert about.

Connecting the two accounts below turns that into one shared database, and
the notifications and emails start working.

**Time:** about 45 minutes. **Cost:** $0 at this volume.

You'll create two accounts. I can't create them for you — they need your
email and your agreement to their terms.

---

## What you're setting up

| Service | What it does | Free tier |
|---|---|---|
| **Supabase** | The shared database, sign-ins, and the code that sends notifications | 500MB database, 500k function calls/month |
| **Resend** | Sends the confirmation and reminder emails | 3,000 emails/month, 100/day |
| Web Push | The notifications themselves | Free — it's built into browsers |

---

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → **Start your project** → sign in with GitHub.
2. **New project.**
   - Name: `community-butler`
   - Database password: generate one and save it in your password manager. You won't need it often, but you can't recover it.
   - Region: **East US (North Virginia)** — closest to Illinois.
3. Wait ~2 minutes for it to finish setting up.

### Create the tables

4. Left sidebar → **SQL Editor** → **New query**.
5. Open `supabase/schema.sql` in this repo, copy the whole file, paste it in, and hit **Run**.
   You should see "Success. No rows returned."
6. New query again, and do the same with the "Create your own admin account" step below — but first:

### Turn off email confirmation

7. **Authentication** → **Sign In / Providers** → **Email**.
8. Turn **Confirm email** off, then **Save**.

   Butlers sign up and are dropped straight into their dashboard. With
   confirmation on they'd have to leave the app, find an email, come back
   and sign in again — and a fair number won't.

### Make yourself an admin

9. **Authentication** → **Users** → **Add user** → **Create new user**.
   - Email: your email
   - Password: a new one, not reused from anywhere
   - Tick **Auto Confirm User**
10. Copy the new user's **UID**.
11. **SQL Editor** → new query, replacing both placeholders:

    ```sql
    insert into public.admins (user_id, email)
    values ('<PASTE-THE-UID>', '<your-email>');
    ```

### Get the two keys the app needs

12. **Project Settings** → **API**. You need:
    - **Project URL** → `VITE_SUPABASE_URL`
    - **anon public** key → `VITE_SUPABASE_ANON_KEY`

    The anon key is safe to publish — it identifies the project and
    authorises nothing by itself. The row-level security policies in
    `schema.sql` decide what anyone can actually read.

    On the same page there's a **service_role** key. That one bypasses
    every policy. It goes in exactly one place (step 4 below) and must
    never appear in this repository, a build, or a chat window.

---

## 2. Create the Resend account

1. Go to [resend.com](https://resend.com) → sign up.
2. **Domains** → **Add domain** → `thecommunitybutler.com`.
3. Resend shows you DNS records. Add them wherever the domain is managed
   (that's Wix today). Verification usually takes a few minutes.

   **This step isn't optional.** Without a verified domain, Resend only
   lets you email *yourself* — so every neighbour's confirmation would
   silently fail. If the domain isn't ready yet, everything else still
   works; the emails just won't send until it is.

4. **API Keys** → **Create API Key** → name it `community-butler`,
   permission **Sending access**. Copy it now — it's shown once.

---

## 3. Generate the notification keys

On your own machine, in this repo:

```bash
node scripts/generate-vapid-keys.mjs
```

It prints a public key and a private key and tells you where each goes.
The private key is what proves a notification came from you — treat it
like a password, and don't paste it into a chat window.

---

## 4. Add the secrets to Supabase

**Edge Functions** → **Secrets** → add each of these:

| Name | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | from step 3 |
| `VAPID_PRIVATE_KEY` | from step 3 |
| `VAPID_SUBJECT` | `mailto:thecommunitybutler@gmail.com` |
| `RESEND_API_KEY` | from step 2 |
| `EMAIL_FROM` | `Community Butler <hello@thecommunitybutler.com>` |
| `APP_URL` | `https://blaisegalley.github.io/Community-butler-/` |
| `APP_TIMEZONE` | `America/Chicago` |
| `CRON_SECRET` | any long random string — make one up, save it, you need it again in step 6 |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.
You don't add those.

---

## 5. Deploy the notification code

Install the Supabase CLI and, from this repo:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase functions deploy notify-butlers
npx supabase functions deploy job-confirmed
npx supabase functions deploy send-reminders
npx supabase functions deploy invite-admin
```

Your project ref is in **Project Settings → General**.

---

## 6. Turn on the day-before reminder

1. Open `supabase/schedule.sql`.
2. Replace `<PROJECT-REF>` and `<CRON-SECRET>` with your real values.
3. Paste it into the **SQL Editor** and run it.

It runs daily at 15:00 UTC (mid-morning in Illinois) and emails everyone
whose job is the next day.

---

## 7. Point the live site at the database

**GitHub** → this repo → **Settings** → **Secrets and variables** →
**Actions** → **Variables** tab → **New repository variable**, three times:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | from step 1 |
| `VITE_SUPABASE_ANON_KEY` | from step 1 |
| `VITE_VAPID_PUBLIC_KEY` | from step 3 |

Variables, not Secrets — these three ship inside the app either way, and
Secrets would just make them harder for you to check later.

Then **Actions** → **Deploy to GitHub Pages** → **Run workflow**.

---

## 8. Check it actually works

```bash
VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node scripts/verify-backend.mjs
```

This confirms the tables exist, the edge functions are deployed, a
signed-out neighbour can post a job — and, most importantly, that nobody
can read neighbours' addresses without signing in. Every failing line
names the step to go back to.

Then walk through it by hand:

1. Post a job from your phone.
2. Open the admin dashboard on your laptop. **The red "Demo mode" banner
   should be gone**, and the job should be there. That's the whole point
   of this setup — two different devices, one database.
3. Approve it. Any butler with alerts on gets a notification.
4. Assign it. The neighbour gets an email and a notification.

---

## What to know about iPhones

You chose push notifications over text messages. On Android and desktop
they just work. On iPhone there's one catch worth being upfront about:

**Safari on iPhone cannot receive push notifications from a website.** It
only works once the app has been added to the home screen. Until a butler
does that, they will get nothing — no error, no prompt, just silence.

The app handles this as well as it can: it shows the Add to Home Screen
steps, and on the butler dashboard it says plainly that alerts won't work
until the app is installed rather than showing a button that does nothing.

But it's worth telling butlers directly when they sign up: **add the app
to your home screen or you won't hear about jobs.** If you find butlers
are still missing work, texting is the reliable fallback — it costs money
(Twilio, roughly a cent a message) but it reaches every phone.

---

## Running it locally

```bash
cp .env.example .env.local   # fill in the three VITE_ values
npm run dev
```

Note that notifications don't work under `npm run dev` — the service
worker is only registered in production builds, because a worker caching
dev modules makes hot reload lie about what's on screen. To test
notifications locally:

```bash
npm run build && npm run preview
```

---

## One thing to change regardless

The demo admin password used to be a real one, committed to a public
repository. It's now an obvious throwaway (`butler`), and it only applies
to the localStorage fallback — once Supabase is connected, the real admin
login is the account you made in step 1.

**If that old password is used anywhere else — email, iCloud, anything —
change it there.** It has been publicly visible in this repo's history.
