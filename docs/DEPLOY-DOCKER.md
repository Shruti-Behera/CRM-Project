# Go live with Docker (everything in one place)

One command brings up the whole thing: the web app + API in one container,
PostgreSQL in another, on the same machine.

## What you need on the server
- A Linux server (any cloud VM works) with a public IP
- **Docker** with the **compose** plugin
  (`curl -fsSL https://get.docker.com | sh`)
- That's it — no .NET SDK, no Node, no manual PostgreSQL install.

## 1 — Get the project onto the server
Copy the whole repo folder to the server (git clone, scp, or an upload). From
inside the folder:

## 2 — Set your secrets
```bash
cp .env.example .env
# edit .env and set:
#   DB_PASSWORD  = a strong database password
#   JWT_SECRET   = openssl rand -base64 48
nano .env
```

## 3 — Build and start
```bash
docker compose up -d --build
```
- Builds the React app and the .NET server into one image.
- Starts PostgreSQL and, on the **first run only**, loads `db/schema.sql`
  then `db/seed.sql` automatically.
- The app listens on port **8080**.

Check it: `curl http://localhost:8080/api/health` → `{"ok":true,"db":"up"}`

## 4 — Create the first Super Admin
```bash
docker compose run --rm app create-admin
```
Answer the prompts (email, name, employee ID, a password of 12+ characters).
No user ships in the seed, so this is how you get in the first time.

## 5 — Open it
`http://<your-server-ip>:8080` — sign in with the admin you just created.

---

## Make it a real HTTPS site (recommended — required for the voice feature)
Point a domain's A-record at the server, then add automatic HTTPS with Caddy.
Create **`docker-compose.override.yml`** next to the compose file:

```yaml
services:
  caddy:
    image: caddy:2
    depends_on: [app]
    ports:
      - "80:80"
      - "443:443"
    command: caddy reverse-proxy --from https://YOUR-DOMAIN.com --to app:8080
    restart: unless-stopped
  app:
    ports: []          # stop exposing 8080 publicly; Caddy fronts it
```
Then `docker compose up -d`. Caddy fetches a Let's Encrypt certificate on its
own; browse to `https://YOUR-DOMAIN.com`.

## Everyday operations
- **Logs**: `docker compose logs -f app`
- **Stop / start**: `docker compose down` / `docker compose up -d`
- **Update after code changes**: `docker compose up -d --build`
  (the database and uploaded files are kept in named volumes)
- **Backup — the only two things that hold state:**
  ```bash
  docker compose exec db pg_dump -U ashika -F c ashika_wdm > backup-$(date +%F).dump
  docker run --rm -v ashika-dotnet-postgres_uploads:/u -v "$PWD":/out alpine tar czf /out/uploads-$(date +%F).tgz -C /u .
  ```
- **Restore the database** into a fresh volume:
  `docker compose exec -T db pg_restore -U ashika -d ashika_wdm < backup.dump`

## Notes
- The schema/seed run **only when the database volume is empty**. To reload
  from scratch: `docker compose down -v` (this deletes all data), then
  `docker compose up -d --build`.
- Everything else in the app is configuration via env vars in the compose
  file — no source code changes are needed to deploy.
