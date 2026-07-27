# Deploying Ashika WDM — .NET 8 + PostgreSQL 16 on Windows IIS

One application: ASP.NET Core serves both the REST API (under `/api`) and the
compiled React app, hosted in-process inside IIS. PostgreSQL is the only other
moving part.

## What you need on the server

- **Windows Server** with the **IIS role** enabled
- **.NET 8 Hosting Bundle** — https://dotnet.microsoft.com/download/dotnet/8.0
  (installs the ASP.NET Core Module that lets IIS host the app; restart IIS
  after installing: `net stop was /y && net start w3svc`)
- **IIS URL Rewrite module** (for the HTTPS redirect)
- **PostgreSQL 16** — the Windows installer from https://www.postgresql.org/download/windows/
  (local, or on a database server the web server can reach on port 5432)
- To build: **.NET 8 SDK** and **Node.js 20** on whichever machine does the
  build (the server itself, or a build machine — only the published output
  needs to reach the server)

## 1 — Database

Open **SQL Shell (psql)** or pgAdmin as the `postgres` superuser:

```sql
CREATE DATABASE ashika_wdm;
CREATE USER ashika_app WITH PASSWORD '<a strong password>';
```

The app user deliberately gets data rights only — no DDL — so run the schema
as `postgres` (connected to **ashika_wdm**):

```
psql -U postgres -d ashika_wdm -f db/schema.sql
psql -U postgres -d ashika_wdm -f db/seed.sql
```

Then grant the app what it needs (still connected to ashika_wdm):

```sql
GRANT USAGE ON SCHEMA public TO ashika_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ashika_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ashika_app;
```

If PostgreSQL runs on a separate machine, allow the web server's address in
`pg_hba.conf` with `scram-sha-256` and reload.

## 2 — Configure

Configuration lives in `Server/appsettings.json`, with production overrides in
`appsettings.Production.json` (create it next to the exe after publishing, or
in `Server/` before publishing so it is included):

```json
{
  "ConnectionStrings": {
    "Db": "Host=127.0.0.1;Port=5432;Database=ashika_wdm;Username=ashika_app;Password=<the password>;Maximum Pool Size=10"
  },
  "Jwt": { "Secret": "<60+ random characters — generate, do not type>", "ExpiryHours": 8 },
  "Uploads": { "Dir": "C:\\apps\\ashika-wdm\\storage\\uploads", "MaxMb": 15 }
}
```

Generate the secret in PowerShell:
`-join ((48..57)+(97..122) | Get-Random -Count 64 | % {[char]$_})`

Leave `Cors:Origin` empty in production — the app and API share one origin.

## 3 — Build

From the repo root, on the build machine:

```
powershell -File deploy\build-client.ps1        # React app → Server/wwwroot
cd Server
dotnet publish -c Release -o C:\apps\ashika-wdm\site
```

The publish folder now holds `AshikaWdm.exe`, `wwwroot\` (the web app),
`appsettings*.json` and a generated `web.config`. Replace that `web.config`
with `deploy\web.config` from this repo to get the HTTPS redirect and
security headers.

## 4 — Create the first Super Admin

From the publish folder (needs the database reachable):

```
AshikaWdm.exe create-admin
```

It asks for email, name, employee ID and a password of at least 12
characters, and hashes it before writing. No account ships in the seed —
a password in a seed file is either wrong or published, and both are worse
than nothing.

## 5 — The IIS site

1. IIS Manager → **Application Pools** → Add: name `AshikaWdm`,
   **.NET CLR version: No Managed Code** (the module hosts .NET itself),
   pipeline Integrated.
2. **Sites → Add Website**: name `Ashika WDM`, physical path
   `C:\apps\ashika-wdm\site`, application pool `AshikaWdm`, binding
   `https` with your certificate (and an `http` binding, which the rewrite
   rule redirects).
3. Give the app pool identity write access to two folders:
   `...\site\logs` (module stdout logs) and the uploads folder from
   `appsettings.Production.json`:
   ```
   icacls C:\apps\ashika-wdm\storage /grant "IIS AppPool\AshikaWdm:(OI)(CI)M"
   icacls C:\apps\ashika-wdm\site\logs /grant "IIS AppPool\AshikaWdm:(OI)(CI)M"
   ```
4. Browse to the site — the sign-in page should load, and
   `https://<host>/api/health` should answer `{"ok":true,"db":"up"}`.

## 6 — Backups

Two things hold all state:

- the database:
  `pg_dump -U postgres -F c ashika_wdm > wdm-%date%.backup` — schedule
  nightly with Task Scheduler; restore with `pg_restore -d ashika_wdm`
- uploaded files: the `storage\uploads` folder

Copy both off the machine.

## 7 — Updating

```
powershell -File deploy\build-client.ps1
cd Server && dotnet publish -c Release -o C:\apps\ashika-wdm\site
```

Publishing over a running site is blocked by file locks — stop the app pool
first (`Stop-WebAppPool AshikaWdm`), publish, start it again. Keep
`appsettings.Production.json` and the storage folder; everything else is
replaceable output.

## When something is wrong

- `https://<host>/api/health` — says whether the app can reach PostgreSQL
- `site\logs\stdout*.log` — the application's own output, including startup
  errors (a wrong connection string shows up here)
- Windows Event Viewer → Application — IIS/ANCM messages when the process
  fails to start at all
- 502.5 / 500.30 from IIS → the Hosting Bundle is missing or the app crashed
  on startup; the stdout log has the reason
- Sign-in returns 401 for the admin → run `AshikaWdm.exe create-admin` again
- Styles or fonts missing → `wwwroot` was not published; re-run
  `deploy\build-client.ps1` before `dotnet publish`
