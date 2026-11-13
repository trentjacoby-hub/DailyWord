#!/usr/bin/env node
/**
 * Today's Teachings - home-machine readings pusher.
 *
 * WHY THIS EXISTS
 * CatholicGallery sits behind Cloudflare, which blocks Vercel's datacenter
 * egress IPs. The site therefore cannot scrape its own source. This script runs
 * on a machine with a residential IP, fetches the raw HTML, and POSTs it to the
 * site's /api/ingest endpoint, which parses it and runs the Claude analysis.
 *
 * It deliberately does NO parsing: all that logic stays server-side, so if the
 * upstream markup changes you fix it with a redeploy and never touch a client.
 *
 * PORTABILITY
 * Zero npm dependencies. Node 18+ only. Everything resolves relative to this
 * file, so you can copy the `scripts/` folder to any machine, drop a config
 * file next to it, and run. Nothing is hardcoded to a machine, user or path.
 *
 * CONFIG (first match wins)
 *   1. Environment: TT_SITE_URL, TT_INGEST_SECRET
 *   2. push-readings.config.json next to this script
 *   3. ../.env.local (INGEST_SECRET or CRON_SECRET) - convenient on the dev machine
 *
 * USAGE
 *   node push-readings.mjs                 # today (America/Chicago)
 *   node push-readings.mjs --date 2026-11-01
 *   node push-readings.mjs --backfill 7    # last 7 days, oldest first
 *   node push-readings.mjs --force         # re-analyze even if already stored
 *   node push-readings.mjs --dry-run       # fetch + report, never POST
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = path.join(HERE, 'push-readings.log');
const MAX_LOG_BYTES = 512 * 1024;
const TIMEZONE = 'America/Chicago';
const DEFAULT_SITE = 'https://www.todaysteachings.com';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Upgrade-Insecure-Requests': '1',
};

// -- logging ---------------------------------------------------------------
function log(level, msg) {
  const line = `[${new Date().toISOString()}] ${level} ${msg}`;
  console.log(line);
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_LOG_BYTES) {
      const keep = fs.readFileSync(LOG_FILE, 'utf8').slice(-MAX_LOG_BYTES / 2);
      fs.writeFileSync(LOG_FILE, keep);
    }
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {
    /* logging must never break the run */
  }
}

// -- config ----------------------------------------------------------------
function readEnvFile(file) {
  const out = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* absent is fine */
  }
  return out;
}

function loadConfig() {
  let fileCfg = {};
  const cfgPath = path.join(HERE, 'push-readings.config.json');
  try {
    if (fs.existsSync(cfgPath)) fileCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch (e) {
    log('WARN', `could not parse ${cfgPath}: ${e.message}`);
  }

  const dotEnv = readEnvFile(path.join(HERE, '..', '.env.local'));

  const siteUrl = (process.env.TT_SITE_URL || fileCfg.siteUrl || DEFAULT_SITE).replace(/\/+$/, '');
  const secret =
    process.env.TT_INGEST_SECRET ||
    fileCfg.ingestSecret ||
    dotEnv.INGEST_SECRET ||
    dotEnv.CRON_SECRET;

  return { siteUrl, secret };
}

// -- dates -----------------------------------------------------------------
/** Today in the site's timezone, as YYYY-MM-DD. en-CA formats as ISO. */
function todayISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function shiftISO(iso, deltaDays) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

/** CatholicGallery uses a ddMMyy path segment. */
function sourceUrl(iso) {
  const [y, m, d] = iso.split('-');
  return `https://www.catholicgallery.org/mass-reading/${d}${m}${y.slice(2)}/`;
}

// -- work ------------------------------------------------------------------
async function withRetry(label, fn, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (e.fatal) throw e;
      if (i < attempts) {
        const waitMs = 2000 * i;
        log('WARN', `${label} failed (attempt ${i}/${attempts}): ${e.message} - retrying in ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }
  throw lastErr;
}

async function fetchSource(iso) {
  const url = sourceUrl(iso);
  const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow' });
  if (!res.ok) throw new Error(`source returned HTTP ${res.status} for ${url}`);
  const html = await res.text();
  if (html.length < 5000) {
    throw new Error(`source returned suspiciously small body (${html.length} bytes)`);
  }
  return html;
}

async function pushDay(iso, cfg, opts) {
  log('INFO', `--- ${iso} ---`);

  const html = await withRetry(`fetch ${iso}`, () => fetchSource(iso));
  log('INFO', `fetched ${html.length} bytes from source`);

  if (opts.dryRun) {
    log('INFO', `dry run - not posting ${iso}`);
    return 'dry_run';
  }

  const result = await withRetry(`ingest ${iso}`, async () => {
    const res = await fetch(`${cfg.siteUrl}/api/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.secret}`,
      },
      body: JSON.stringify({ date: iso, html, force: opts.force }),
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 300) };
    }

    // 4xx are permanent - retrying cannot help, so fail loudly and stop.
    if (res.status === 401) {
      throw Object.assign(new Error('ingest rejected the secret (401)'), { fatal: true });
    }
    if (!res.ok && res.status < 500) {
      throw Object.assign(new Error(`ingest returned ${res.status}: ${JSON.stringify(json)}`), {
        fatal: true,
      });
    }
    if (!res.ok) throw new Error(`ingest returned ${res.status}: ${JSON.stringify(json)}`);

    return json;
  });

  const listed = (result.readings || []).join(' | ') || 'no readings listed';
  log('INFO', `ingest -> ${result.status} (${listed})`);
  return result.status;
}

// -- main ------------------------------------------------------------------
async function main() {
  // Logged before anything else can fail, so a run that dies early still
  // leaves a trace. A scheduled task that reports "terminated" with no line
  // here never got as far as executing this script.
  log('INFO', `=== start (pid ${process.pid}, node ${process.version}) ===`);

  const argv = process.argv.slice(2);
  const opts = {
    force: argv.includes('--force'),
    dryRun: argv.includes('--dry-run'),
  };
  const dateArg = argv[argv.indexOf('--date') + 1];
  const backfillArg = argv[argv.indexOf('--backfill') + 1];

  const cfg = loadConfig();

  if (!cfg.secret && !opts.dryRun) {
    log(
      'ERROR',
      'No ingest secret found. Set TT_INGEST_SECRET, or add push-readings.config.json next to this script.'
    );
    process.exit(2);
  }

  let dates;
  if (argv.includes('--date')) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateArg || '')) {
      log('ERROR', '--date requires YYYY-MM-DD');
      process.exit(2);
    }
    dates = [dateArg];
  } else if (argv.includes('--backfill')) {
    const n = Number(backfillArg);
    if (!Number.isInteger(n) || n < 1 || n > 60) {
      log('ERROR', '--backfill requires an integer 1-60');
      process.exit(2);
    }
    const today = todayISO();
    dates = Array.from({ length: n }, (_, i) => shiftISO(today, -(n - 1 - i)));
  } else {
    dates = [todayISO()];
  }

  const host = process.env.COMPUTERNAME || process.env.HOSTNAME || 'unknown';
  log('INFO', `host=${host} site=${cfg.siteUrl} dates=${dates.join(',')}`);

  let failures = 0;
  for (const iso of dates) {
    try {
      await pushDay(iso, cfg, opts);
    } catch (e) {
      failures++;
      log('ERROR', `${iso} failed: ${e.message}`);
      if (e.fatal) {
        log('ERROR', 'fatal error - stopping.');
        break;
      }
    }
  }

  if (failures) {
    log('ERROR', `done with ${failures} failure(s)`);
    process.exit(1);
  }
  log('INFO', 'done');
}

main().catch((e) => {
  log('ERROR', `unhandled: ${e.stack || e.message}`);
  process.exit(1);
});
