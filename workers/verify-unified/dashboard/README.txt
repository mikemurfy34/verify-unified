This worker serves static files from workers/verify-unified as assets.
Because the dashboard lives at workers/verify-unified/dashboard/,
it is available at:  /dashboard/index.html, /dashboard/overview.html, etc.

The Worker code in src/index.mjs continues to handle /health and /verify.
Assets are served before the fetch() handler (Wrangler assets pipeline).