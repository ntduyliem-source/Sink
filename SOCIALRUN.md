# SocialRun integration

This fork adds two site-token-protected read endpoints:

- `GET /api/shortlinks`: authoritative D1 link inventory, substring search, column sorting and 100-row pages. It never returns link passwords.
- `GET /api/traffic`: aggregate click statistics with an inclusive `since` and exclusive `until` Unix-second range, optional slug, and paginated per-link counts.

Apply the generated D1 migrations before deployment. Set `NUXT_TRAFFIC_ENABLED=true` and `NUXT_TRAFFIC_STARTED_AT` in the ignored deployment configuration to record traffic. The default remains disabled for other deployments.

Only GET resolutions are recorded. D1 stores time, Halifax day, link identity, country, device, browser, referring hostname and an automated-traffic flag. The traffic table does not store IP addresses or full user agents. Known bots and previews are reported separately; click counts do not represent unique people. Traffic history survives link deletion. Background recording failures are logged and never block redirects.

Link writes continue to use Sink's original create/edit/delete endpoints and cache synchronization. The local SocialRun server holds the site token in its Windows-protected credential file; the browser never receives it. Instance-specific resource IDs, domains and credentials belong in ignored deployment configuration and encrypted secrets, not tracked source.
