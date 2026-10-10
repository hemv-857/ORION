#!/usr/bin/env node
// Standalone Render cron service for supply_chain:portwatch-ports.
//
// Split out of seed-bundle-portwatch.mjs on 2026-04-20 because ArcGIS
// Daily_Ports_Data queries scale poorly at the N-countries level: even
// with per-country ISO3-indexed WHERE clauses + concurrency 12, wall
// time exceeded the bundle's 540s budget. Globalising the fetch (PR
// #3225) traded timeouts for a different failure mode (42s full-table
// scans + intermittent "Invalid query parameters"). Giving this seeder
// its own container decouples its worst-case runtime from the main
// portwatch bundle and lets it run on an interval appropriate to the
// ~10-day upstream dataset lag.
//
// Render cron job provisioning checklist (after merge):
//   1. Create new cron job: portwatch-port-activity-seed
//      Dockerfile: Dockerfile.seed-bundle-portwatch-port-activity,
//      root directory: "" (repo root)
//   2. Schedule: "0 */24 * * *" (daily, UTC) — dataset lag means
//      12h cadence is overkill; 24h keeps us inside the freshness
//      expectations downstream
//   3. Env vars (copy from existing seed jobs):
//      UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,
//      PROXY_URL (for 429 fallback)
//   4. Monitor first run for STALE_SEED recovery on portwatch-ports.
import { runBundle, HOUR } from './_bundle-runner.mjs';

await runBundle('portwatch-port-activity', [
  {
    label: 'PW-Port-Activity',
    script: 'seed-portwatch-port-activity.mjs',
    seedMetaKey: 'supply_chain:portwatch-ports',
    canonicalKey: 'supply_chain:portwatch-ports:v1:_countries',
    // 12h interval gate — matches the historical cadence. Actual Render
    // cron should trigger at 24h; the interval gate prevents rapid-fire
    // re-runs if someone manually retriggers mid-day.
    intervalMs: 12 * HOUR,
    // 540s section timeout — full budget for the one section. Bundle
    // runner still SIGTERMs if the child hangs, and the seeder's
    // SIGTERM handler releases the lock + extends TTLs.
    timeoutMs: 540_000,
  },
], { maxBundleMs: 570_000 });
