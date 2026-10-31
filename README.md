# worshiptechu-status

The public status page for WorshipTechU, at https://status.worshiptechu.ca. It runs on GitHub Pages, outside Vercel and Supabase.

- `config/urls.txt`: the public URLs checked every 5 minutes, each tagged with a service.
- `incident.json`: the incident note shown at the top of the page. Edit it in the browser (pencil icon) and commit; the page updates within a minute.
- `site/`: the page. `scripts/`: the probe and the status builder (`node --test scripts/`).
- `.github/workflows/status.yml`: probes, saves history to the `data` branch, publishes with Pages. No secrets.

Incident note format:

```json
{
  "title": "sign-in is failing for some people",
  "updates": [
    { "at": "2026-10-31T15:12:00Z", "text": "we see sign-in errors. downloaded sos steps still work offline. next update by 3:45 pm." }
  ]
}
```

Clear it with `{"title":"","updates":[]}` about an hour after the fix. Never put keys, internal URLs or error text in this repo: it is public.
