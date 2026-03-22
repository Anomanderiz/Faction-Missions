# Waterdeep Campaign Board

A mobile-first Next.js + Supabase rebuild of the original Streamlit faction missions board.

## What this version does

- keeps **Faction Missions** but makes them editable in-app from a DM control panel
- adds a **Storylines** section with arc labels: `MSQ`, `SQ`, `MSQ/SQ`
- lets players open a storyline and read the short blurb
- adds a **live story vote**
  - DM opens the poll
  - players vote with a character name
  - everyone can see who voted for what
  - poll closes automatically at `max_votes` (default `5`)
  - Discord webhook announces the opening and the winner
- uses **Supabase Postgres** instead of JSON / Google Sheets
- uses a simple **DM password login** backed by a signed HttpOnly cookie

## Why the DM login is custom instead of Supabase Auth

You only have one DM and no need for player accounts. A password-gated admin session is lighter to configure than a full auth stack and still keeps the control panel locked down.

If you want, you can swap this later for Supabase Auth without changing the database schema.

## Stack

- Next.js App Router
- TypeScript
- Supabase Postgres
- Supabase Realtime (Postgres Changes subscriptions in the browser)
- Discord webhook for poll announcements

## Project structure

```text
app/
  api/
    public/
      state/route.ts      # player-safe board state
      vote/route.ts       # casts a vote via SQL RPC
    dm/
      login/route.ts      # password login
      logout/route.ts
      state/route.ts      # DM dashboard data
      missions/route.ts   # mission CRUD
      story-arcs/route.ts # storyline CRUD
      polls/route.ts      # open/cancel polls
  dm/
    login/page.tsx
    page.tsx
  player/page.tsx
  page.tsx
components/
  PlayerApp.tsx
  DmApp.tsx
  DmLoginForm.tsx
lib/
  auth.ts
  admin-data.ts
  public-data.ts
  polls.ts
  discord.ts
supabase/
  schema.sql
  seed.sql
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_DB_SCHEMA=campaign_board
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=
DISCORD_WEBHOOK_URL=
```

Use a long random string for `ADMIN_SESSION_SECRET`.

## Supabase setup

1. Create a Supabase project.
2. Open the SQL editor.
3. Run `supabase/schema.sql`.
4. In **Settings → API**, add `campaign_board` to **Exposed schemas**.
5. Optionally run `supabase/seed.sql`.
6. Copy your project URL, anon key, service role key, and `NEXT_PUBLIC_SUPABASE_DB_SCHEMA=campaign_board` into `.env.local`.
7. Add your Discord webhook URL if you want open / close announcements.

## Install and run

```bash
npm install
npm run dev
```

Open:

- `http://localhost:3000/player` for the player board
- `http://localhost:3000/dm/login` for the DM panel

## Important implementation notes

### 1) Voting race safety

The vote-closing logic lives in Postgres, not in the browser.

`campaign_board.cast_story_vote(...)`:
- locks the poll row
- validates the ballot option
- inserts the vote
- counts votes
- closes the poll at the threshold
- resolves the winner inside the same transaction

That avoids the classic “two people cast the fifth vote at once” nonsense.

### 2) Tie-break rule

If two arcs tie, the winner is whichever tied arc received its **first** vote earlier.

### 3) Public visibility

Players can read:
- non-archived faction missions
- visible, non-archived story arcs
- poll state
- votes

Players cannot write directly to the database. Voting is done through the app’s server route, which calls the SQL function with the service-role client.

### 4) Realtime

The player board subscribes to changes on:
- `campaign_board.story_votes`
- `campaign_board.story_polls`
- `campaign_board.story_poll_options`
- `campaign_board.story_arcs`
- `campaign_board.faction_missions`

On change, the UI refetches the public state and refreshes the vote panel.

## Future upgrades you may want

- swap custom DM password for Supabase Auth
- add image attachments or quest art
- add mission deadlines or renown rewards
- add runoff polls for tie scenarios
- add per-session DM audit logs

## Original app note

The original Streamlit repo stored data in local JSON with an optional Google Sheets bridge. This rebuild replaces that with Supabase-backed CRUD and poll logic so you can edit everything from the app itself.

## Separate-schema note

This version is wired for a dedicated Supabase schema named `campaign_board` rather than `public`.
That keeps it isolated from your other apps, but it does mean the app and SQL must agree on the schema name.
If you want a different schema name, change `NEXT_PUBLIC_SUPABASE_DB_SCHEMA` and update the SQL accordingly before deployment.
