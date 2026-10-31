// Public status page data. `node status.mjs build <dir> [incident.json]` reads report.json (from probe.mjs), the history
// already in <dir>/history.json and the incident note (default incident.json), then writes <dir>/history.json and
// <dir>/status.json. Only friendly service names and counts are written: no URLs, no hosts, no error text.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const SERVICES = [
  { id: 'website', name: 'website' },
  { id: 'app', name: 'app sign-in and data' },
  { id: 'canyonai', name: 'canyonAI' },
  { id: 'emails', name: 'emails' },
];
export const DAYS = 90;
export const SLOW_MS = 4000;

// One probe -> 'up' | 'slow' | 'down'.
export function classify(check) {
  if (!check || check.error) return 'down';
  const expect = Array.isArray(check.expect) ? check.expect : [200];
  if (!expect.includes(check.status)) return 'down';
  return Number(check.ms) > SLOW_MS ? 'slow' : 'up';
}

const rank = { up: 0, slow: 1, down: 2 };

// Worst result per service for this run; checks without a known service are ignored.
export function serviceStates(checked) {
  const out = {};
  for (const c of checked ?? []) {
    if (!SERVICES.some((s) => s.id === c.service)) continue;
    const st = classify(c);
    if (!(c.service in out) || rank[st] > rank[out[c.service]]) out[c.service] = st;
  }
  return out;
}

export function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

export function updateHistory(history, states, now) {
  const days = { ...(history?.days ?? {}) };
  const key = dayKey(now);
  const today = { ...(days[key] ?? {}) };
  for (const [id, st] of Object.entries(states)) {
    const d = { up: 0, slow: 0, down: 0, ...(today[id] ?? {}) };
    d[st] += 1;
    today[id] = d;
  }
  days[key] = today;
  const keep = Object.keys(days).sort().slice(-DAYS);
  return { days: Object.fromEntries(keep.map((k) => [k, days[k]])) };
}

// A day is green at 99.5 percent or more of checks working, gold at 95 or more, red below, none with no checks.
export function dayState(d) {
  if (!d) return 'none';
  const total = d.up + d.slow + d.down;
  if (total === 0) return 'none';
  const pct = ((d.up + d.slow) / total) * 100;
  if (d.down === 0 && d.slow === 0) return 'up';
  if (pct >= 99.5 && d.slow / total < 0.05) return 'up';
  return pct >= 95 ? 'slow' : 'down';
}

export function overall(states) {
  const vals = Object.values(states);
  if (vals.length === 0) return 'unknown';
  if (vals.includes('down')) return 'down';
  if (vals.includes('slow')) return 'slow';
  return 'up';
}

export function cleanIncident(raw) {
  if (!raw || typeof raw !== 'object' || !String(raw.title ?? '').trim()) return null;
  const updates = Array.isArray(raw.updates) ? raw.updates : [];
  return {
    title: String(raw.title).slice(0, 140),
    since: raw.since ? String(raw.since).slice(0, 40) : null,
    updates: updates
      .slice(-8)
      .map((u) => ({ at: String(u?.at ?? '').slice(0, 40), text: String(u?.text ?? '').slice(0, 600) }))
      .filter((u) => u.text),
  };
}

export function buildStatus(history, states, incident, now) {
  const today = dayKey(now);
  const dates = [];
  for (let i = DAYS - 1; i >= 0; i--) dates.push(dayKey(new Date(now.getTime() - i * 86_400_000)));
  const services = [];
  for (const s of SERVICES) {
    const seen = dates.some((d) => history.days?.[d]?.[s.id]);
    if (!seen) continue;
    const days = dates.map((date) => {
      const d = history.days?.[date]?.[s.id];
      return { date, state: dayState(d), ...(d && { checks: d.up + d.slow + d.down, down: d.down, slow: d.slow }) };
    });
    const withData = days.filter((x) => x.checks);
    const good = withData.reduce((n, x) => n + x.checks - x.down, 0);
    const all = withData.reduce((n, x) => n + x.checks, 0);
    services.push({
      id: s.id,
      name: s.name,
      state: states[s.id] ?? 'unknown',
      uptime: all ? Math.round((good / all) * 10000) / 100 : null,
      days,
    });
  }
  return {
    generatedAt: now.toISOString(),
    today,
    overall: overall(states),
    services,
    incident: cleanIncident(incident),
  };
}

function readJson(path, fallback) {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
  } catch {
    return fallback;
  }
}

if (process.argv[1]?.endsWith('status.mjs') && process.argv[2] === 'build') {
  const dir = process.argv[3];
  if (!dir) throw new Error('Usage: status.mjs build <dir>');
  const report = readJson('report.json', null);
  const now = new Date();
  const states = serviceStates(report?.checked);
  if (Object.keys(states).length === 0) {
    // No measurements: publish nothing, so the page ages into "checks have paused" instead of showing a false green.
    console.error('No service probes in report.json (missing report, or no service= lines in UPTIME_URLS): nothing published.');
    process.exit(3);
  }
  const history = updateHistory(readJson(`${dir}/history.json`, { days: {} }), states, now);
  const status = buildStatus(history, states, readJson(process.argv[4] ?? 'incident.json', null), now);
  writeFileSync(`${dir}/history.json`, JSON.stringify(history));
  writeFileSync(`${dir}/status.json`, JSON.stringify(status));
  console.log(`status.json written: ${status.overall}, ${status.services.length} services`);
}
