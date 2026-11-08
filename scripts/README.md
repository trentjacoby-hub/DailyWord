# Home-machine readings pusher

## Why this exists

`catholicgallery.org` sits behind Cloudflare, which **blocks Vercel's datacenter
egress IPs** (started 2026-09-13). The site cannot scrape its own source, so
every day after Sept 12 rendered the "Analysis is being generated" placeholder.
No Claude tokens were being spent — the failure happened before the analysis.

The fix: a machine on a **residential connection** fetches the raw HTML and
POSTs it to the site, which parses it and runs the analysis server-side.

```
home machine  ──fetch HTML──▶  catholicgallery.org   (residential IP: allowed)
     │
     └──POST {date, html}──▶  /api/ingest  ──▶  parse ──▶ Claude ──▶ KV
```

The client does **no parsing**. All that logic stays in `src/lib/fetchReadings.ts`,
so an upstream markup change is fixed by a redeploy — you never touch a client.

## Switching or adding machines

Nothing is tied to a machine, user, or path. To move or add a machine:

1. Install **Node 18+** (the script uses global `fetch`).
2. Copy the `scripts/` folder anywhere on the new machine.
3. Give it the secret (see below).
4. Run `.\install-task.ps1`.

Running it on **two** machines is supported and recommended — the job is
idempotent, and the per-date cap in `dayData.ts` means a duplicate push costs
nothing. Whichever machine is awake first that day wins; the other reports
`already_complete`. That covers the days your primary machine is off.

## Configuring the secret

The script looks in this order, first match wins:

| Order | Source | Use when |
|---|---|---|
| 1 | `TT_INGEST_SECRET` / `TT_SITE_URL` env vars | CI, or a one-off run |
| 2 | `push-readings.config.json` next to the script | **Any machine without the repo** |
| 3 | `../.env.local` (`INGEST_SECRET`, else `CRON_SECRET`) | The dev machine — zero setup |

For a machine that has the repo checked out, there is nothing to configure —
it reads `CRON_SECRET` from `.env.local`.

Otherwise copy `push-readings.config.example.json` to
`push-readings.config.json` and fill in the secret. That file is gitignored.

The server accepts `INGEST_SECRET` if set in Vercel, otherwise falls back to the
existing `CRON_SECRET`, so no new Vercel env var is required.

## Install the scheduled task

```powershell
cd scripts
.\install-task.ps1                        # daily at 05:30 and 12:30 local
.\install-task.ps1 -Time '06:00','18:00'  # custom times
.\install-task.ps1 -Uninstall             # remove
```

The installer detects Node's path, this folder, and the current user at install
time, then reports what it registered. Re-running it repairs the task.

It configures the task to survive a sleeping machine:

- **WakeToRun** — wakes the PC from sleep to run.
- **StartWhenAvailable** — if the PC was off, runs shortly after next boot.
- **Battery** — allowed to start and keep running on battery.
- Two triggers a day, because the second is a free no-op if the first worked.

It also checks whether wake timers are actually enabled on AC power and warns
if they aren't (a task cannot wake a PC when they're off).

### A caveat worth knowing

Wake timers are **disabled on battery** by default on this laptop. Unplugged,
the task will not wake the machine; it runs at the next opportunity instead.
Enable it if you want, though it costs battery for little gain:

```powershell
powercfg /setdcvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1
powercfg /S SCHEME_CURRENT
```

## Running it by hand

```powershell
node push-readings.mjs                # today (America/Chicago)
node push-readings.mjs --dry-run      # fetch + report, never POST
node push-readings.mjs --date 2026-11-01
node push-readings.mjs --backfill 7   # last 7 days, oldest first
node push-readings.mjs --force        # re-analyze a day already stored
```

`--backfill` costs one analysis per date that isn't already stored. The
per-date cap applies to each date independently, so a long backfill is real
spend — check how many days are actually missing first.

Target a local dev server with `$env:TT_SITE_URL = "http://localhost:3000"`.

## Checking on it

```powershell
Get-Content push-readings.log -Tail 20
Get-ScheduledTaskInfo -TaskName 'TodaysTeachings-DailyReadings'
Start-ScheduledTask   -TaskName 'TodaysTeachings-DailyReadings'   # run now
```

`LastTaskResult` of `0` means success. The script also exits non-zero on
failure, so the task history reflects real outcomes.

## Ingest responses

| Status | Meaning |
|---|---|
| `analyzed` | Every reading plus the reflection is done and stored. The normal path. |
| `analyzed_partial` | Some pieces failed. What succeeded is stored and paid for once; a later run fills only the gaps. Check `issues`. |
| `already_complete` | That date was already finished. **No spend.** |
| `no_readings` (HTTP 422) | Parsed 0 readings — source unpublished, **or the markup changed and the parser needs updating**. |
| `cap_reached` | The date's call budget is used up. **Nothing spent.** |
| `locked` | Another push is mid-analysis for that date. Harmless. |

Every response carries `callsUsed` for the date, and `issues` when something
failed. A persistent `no_readings` means CatholicGallery changed their HTML —
fix `parseReadingsHtml` in `src/lib/fetchReadings.ts` and redeploy.

## How spend is bounded

Cost is budgeted in **Claude calls per date**, not per run, because calls are
what cost money.

- A date needs exactly **readings + 1** calls: one per reading, one for the
  unifying reflection. A weekday is 3, a Sunday 4.
- Work that succeeds is **written to KV immediately** and **never requested
  again**. A resumed run pays only for the pieces that are actually missing.
- A failed piece can no longer discard its billed siblings — each call is
  isolated, and a failure returns a reason instead of throwing.
- The hard ceiling per date is **readings + 1 + 3**. That headroom can only be
  consumed by pieces that failed; it cannot be spent redoing something already
  stored.
- Each request reserves a slot before it is issued, under a per-date lock. A
  reservation that the budget refuses is handed back, so the counter stays an
  honest count of requests actually made.

**The only code path that can spend money is `POST /api/ingest`, which requires
the secret.** Page views and the Vercel cron are cache-only and can never
trigger an analysis, no matter how many times they run.

Two consequences worth knowing:

- Running the pusher repeatedly for a finished day is free — it short-circuits
  on `already_complete`. This is why two daily triggers are safe, and why a
  second machine costs nothing.
- `--force` deliberately re-analyzes a stored day and **does spend again**,
  within the date's budget. Use it only to repair a bad analysis.

To block all spend for a date by hand, set its counter above the ceiling:

```
SET analyze:calls:<YYYY-MM-DD> 999
```

To allow a blocked date to run again, delete that key.
