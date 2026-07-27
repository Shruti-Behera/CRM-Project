# Ashika — Work & Deal Management
## .NET 8 + PostgreSQL 16 + React, for Windows IIS

Three workspaces on one login — Investment & Merchant Banking, Institutional
Business, Internal Work — with the four-level hierarchy (Super Admin, Head,
Manager, Executive) enforced server-side in every query.

## Layout

    db/         schema.sql (55 tables, 7 views, triggers — PostgreSQL 16), seed.sql (master data)
    Server/     ASP.NET Core 8 API + serves the built web app  (AshikaWdm.csproj)
    client/     React 18 + Vite front end (unchanged from the Node build — same /api contract)
    deploy/     web.config for IIS, client build scripts
    docs/       DEPLOY.md — the full IIS runbook; PORTING.md — what remains to port
    prototype-ashika-wdm.html   the signed-off prototype: the behavioural reference

## Quick start (development)

    createdb ashika_wdm && psql -d ashika_wdm -f db/schema.sql && psql -d ashika_wdm -f db/seed.sql
    cd Server
    # edit appsettings.json: connection string + JWT secret
    dotnet run -- create-admin
    dotnet run                      # API on http://localhost:5000
    cd ../client && npm install && npm run dev    # UI on http://localhost:5173

For production — one IIS site serving app and API together — follow
**docs/DEPLOY.md**.

## Where the rules live

- Hierarchy and visibility: `Server/Infrastructure/Core.cs` (`Scope`) — every
  list query includes the caller's scope fragment; nothing is filtered client-side.
- Permissions: the 35-slug grid in the database (`permissions`,
  `role_permissions`, `user_permissions`), loaded per request.
- Derived figures: PostgreSQL triggers (fee roll-ups, logged hours, stage
  history) and views (`v_pipeline_summary`, `v_workload`, …) in `db/schema.sql`.
- Document numbers (OPP-2026-0001 …): `Db.NextNo`, allocated under a row lock
  inside the caller's transaction.

Where the code and the prototype disagree, the prototype is what the business
signed off.
