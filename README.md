# EGYPT GAS Phase 47 — Cloud / SQLite

Private GitHub repository only. Extract this ZIP and upload its contents (including dotfiles) at repository root. Do not upload the separate private database, backups or credentials.

## Coolify
Create a private GitHub application using Dockerfile build pack, branch main, base directory /, port 8080, one replica. Configure a domain and HTTPS. Do not expose port 8080 publicly. Set variables from .env.example (SECURE_COOKIE=1 requires HTTPS). No PostgreSQL/MySQL service needed.

Before first deploy, create persistent **directory bind mount**: source `/srv/egypt-gas/data`, destination `/app/data`. On VPS SSH run `sudo mkdir -p /srv/egypt-gas/data`. Transfer the separate private database using SFTP/SCP to that directory as `egypt_gas.db` (not to GitHub). Example from local terminal: `scp EGYPT_GAS_Private_Database.db YOUR_SSH_USER@YOUR_VPS:/tmp/egypt_gas.db` then on VPS `sudo install -m 600 /tmp/egypt_gas.db /srv/egypt-gas/data/egypt_gas.db && sudo rm /tmp/egypt_gas.db`. Do not repeat this copy on later deployments: it would overwrite live data. Stop local writes before final migration and use a fresh consistent SQLite backup if local data has changed. Deploy, inspect logs and open HTTPS domain. Existing accounts are retained. Change weak/default passwords before exposing publicly. Restrict access to authorized staff (prefer VPN or IP allowlist) pending full security review.

## Persistence and multi-user
Single application process, shared SQLite database, WAL, 60-second busy timeout, FULL synchronous, serialized POST requests. Do not scale replicas or mount on network filesystem. Changes are visible on next page load or refresh button; no live push. Sessions expire after 12 hours or restart. Backups: use existing admin backup download (SQLite online backup); store encrypted off VPS regularly. Do not copy a running raw DB without its WAL; use SQLite backup API. Keep persistent directory when redeploying.

## Verification
Python compilation, JS syntax, source database integrity, local HTTP health, two independent authenticated sessions with eight concurrent item inserts, shared reads and persistence after process restart passed on a disposable database copy. Docker/Coolify deployment, all business workflows, security audit and 16-user load test not performed. Existing app uses Python standard-library HTTP server; restrict access and test before production. External Google font import removed; fallback fonts used.
