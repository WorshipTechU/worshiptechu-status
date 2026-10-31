// Probes every URL in config/urls.txt (public URLs only, one per line: `url service=website|app|canyonai|emails`,
// optional `expect=200,401`) and writes report.json for status.mjs. Never fails the run: a down service is data.
import { readFileSync, writeFileSync } from 'node:fs';

export function parseTargets(text) {
  return String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [url, ...opts] = l.split(/\s+/);
      const expectOpt = opts.find((o) => o.startsWith('expect='));
      const expect = expectOpt ? expectOpt.slice(7).split(',').map(Number) : [200];
      const service = opts.find((o) => o.startsWith('service='))?.slice(8);
      return service ? { url, expect, service } : { url, expect };
    });
}

async function probe(t) {
  const started = Date.now();
  try {
    const res = await fetch(t.url, { redirect: 'follow', signal: AbortSignal.timeout(10_000), headers: { 'user-agent': 'worshiptechu-status/1' } });
    return { service: t.service, status: res.status, ms: Date.now() - started, expect: t.expect };
  } catch (e) {
    return { service: t.service, error: String(e?.name ?? e) };
  }
}

if (process.argv[1]?.endsWith('probe.mjs')) {
  const targets = parseTargets(readFileSync(process.argv[2] ?? 'config/urls.txt', 'utf8'));
  const checked = await Promise.all(targets.map(probe));
  writeFileSync('report.json', JSON.stringify({ at: new Date().toISOString(), checked }));
  console.log(`probed ${checked.length} urls`);
}
