/* =====================================================================
   The institutional desk: clients as holders with schemes beneath them,
   visits, and the brokerage book with its code-first import. Ported from
   routes/institutions.js and routes/brokerage.js.
   ===================================================================== */
using System.Text.Json;
using AshikaWdm.Infrastructure;
using Dapper;

namespace AshikaWdm.Endpoints;

using B = Dictionary<string, JsonElement>;

public static class InstitutionEndpoints
{
    /* A client code may exist in one place only — house or scheme, once. */
    private static async Task AssertCodesFree(Db db, IEnumerable<string?> codes, int? institutionId)
    {
        var list = codes.Where(c => !string.IsNullOrWhiteSpace(c))
                        .Select(c => c!.Trim().ToUpperInvariant()).ToArray();
        if (list.Length == 0) return;
        if (list.Distinct().Count() != list.Length)
            throw AppException.Conflict("The same code appears twice on this client");

        var clash = await db.One("""
            SELECT house_code AS code, name FROM institutions
             WHERE house_code = ANY(@list) AND id <> @id
            UNION ALL
            SELECT s.client_code, i.name FROM institution_schemes s
              JOIN institutions i ON i.id = s.institution_id
             WHERE s.client_code = ANY(@list) AND s.institution_id <> @id
            LIMIT 1
            """, new { list, id = institutionId ?? 0 });
        if (clash is not null)
            throw AppException.Conflict($"{clash.code} already belongs to {clash.name}");
    }

    private sealed record SchemeIn(int? Id, string Name, string? Code, string? Custodian, string Status);

    private static List<SchemeIn> ReadSchemes(B b) =>
        b.ObjArray("schemes").Select(s => new SchemeIn(
            s.OptInt("id"),
            s.Str("name"),
            s.OptStr("client_code")?.Trim().ToUpperInvariant(),
            s.OptStr("custodian"),
            s.Choice("status", ["Active", "Dormant", "Closed"], "Active"))).ToList();

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/institutions", async (HttpContext ctx, Db db) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("institutional.view");
            var s = Scope.Institution(u);
            var where = new List<string> { s.Sql };
            var p = new DynamicParameters();
            p.Add("people", s.People); p.Add("uid", s.UserId);

            var qs = ctx.Request.Query;
            if (!string.IsNullOrEmpty(qs["tier"])) { where.Add("i.tier = @tier"); p.Add("tier", (string)qs["tier"]!); }
            if (!string.IsNullOrEmpty(qs["type"])) { where.Add("i.inst_type = @type"); p.Add("type", (string)qs["type"]!); }
            if (!string.IsNullOrEmpty(qs["q"]))
            {
                where.Add("""
                    (i.name ILIKE @q OR i.house_code ILIKE @q
                      OR EXISTS (SELECT 1 FROM institution_schemes sc
                                  WHERE sc.institution_id = i.id
                                    AND (sc.name ILIKE @q OR sc.client_code ILIKE @q)))
                    """);
                p.Add("q", $"%{qs["q"]}%");
            }

            return Results.Json(await db.Q($"""
                SELECT i.*, u.name AS rm,
                       (SELECT COUNT(*) FROM institution_schemes s WHERE s.institution_id = i.id) AS schemes,
                       (SELECT MAX(visit_date) FROM client_visits v WHERE v.institution_id = i.id) AS last_met,
                       (CURRENT_DATE - (SELECT MAX(visit_date) FROM client_visits v
                                         WHERE v.institution_id = i.id)) AS days_since_met,
                       (SELECT COALESCE(SUM(b.brokerage),0) FROM brokerage b
                         WHERE b.institution_id = i.id) AS brokerage_total
                  FROM institutions i JOIN users u ON u.id = i.rm_id
                 WHERE {string.Join(" AND ", where)} ORDER BY i.name
                """, p));
        });

        app.MapGet("/api/institutions/{id:int}", async (HttpContext ctx, Db db, int id) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("institutional.view");
            var s = Scope.Institution(u);
            var row = await db.One($"""
                SELECT i.*, u.name AS rm, c.name AS country
                  FROM institutions i JOIN users u ON u.id = i.rm_id
                  LEFT JOIN countries c ON c.id = i.country_id
                 WHERE {s.Sql} AND i.id = @id
                """, new { people = s.People, uid = s.UserId, id })
                ?? throw AppException.NotFound("No such client, or it is outside your coverage");

            row.schemes = await db.Q("""
                SELECT s.*,
                       (SELECT COALESCE(SUM(b.turnover),0)  FROM brokerage b WHERE b.scheme_id = s.id) AS turnover,
                       (SELECT COALESCE(SUM(b.brokerage),0) FROM brokerage b WHERE b.scheme_id = s.id) AS brokerage
                  FROM institution_schemes s WHERE s.institution_id = @id ORDER BY s.name
                """, new { id });
            row.visits = await db.Q("""
                SELECT v.*, u.name AS logged_by_name,
                       (SELECT STRING_AGG(symbol, ',') FROM client_visit_stocks
                         WHERE visit_id = v.id) AS stocks
                  FROM client_visits v JOIN users u ON u.id = v.logged_by
                 WHERE v.institution_id = @id ORDER BY v.visit_date DESC LIMIT 25
                """, new { id });
            row.brokerage = await db.Q("""
                SELECT b.*, s.name AS scheme FROM brokerage b
                  LEFT JOIN institution_schemes s ON s.id = b.scheme_id
                 WHERE b.institution_id = @id ORDER BY b.period_month DESC LIMIT 60
                """, new { id });
            return Results.Json((object)row);
        });

        app.MapPost("/api/institutions", async (HttpContext ctx, Db db, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("institutional.create");
            var schemes = ReadSchemes(b);
            var houseCode = b.OptStr("house_code")?.Trim().ToUpperInvariant();
            await AssertCodesFree(db, [houseCode, .. schemes.Select(x => x.Code)], null);

            var id = await db.Tx(async (conn, tx) =>
            {
                var reference = await Db.NextNo(conn, tx, "institutions", "institution_ref", "ICL");
                var iid = await conn.ExecuteScalarAsync<int>("""
                    INSERT INTO institutions
                      (institution_ref, name, house_code, inst_type, tier, empanelment, rm_id,
                       country_id, city, aum_cr, contact_name, contact_role, contact_email, note)
                    VALUES (@reference, @name, @houseCode, @instType, @tier, @empanelment, @rm,
                            @country, @city, @aum, @contactName, @contactRole, @contactEmail, @note)
                    RETURNING id
                    """, new
                {
                    reference,
                    name = b.Str("name"),
                    houseCode,
                    instType = b.Str("inst_type"),
                    tier = b.Choice("tier", ["A", "B", "C"], "C"),
                    empanelment = b.OptStr("empanelment") ?? "In process",
                    rm = b.Int("rm_id"),
                    country = b.OptInt("country_id"),
                    city = b.OptStr("city"),
                    aum = b.Dec("aum_cr"),
                    contactName = b.OptStr("contact_name"),
                    contactRole = b.OptStr("contact_role"),
                    contactEmail = b.OptStr("contact_email"),
                    note = b.OptStr("note")
                }, tx);

                foreach (var sc in schemes)
                    await conn.ExecuteAsync("""
                        INSERT INTO institution_schemes (institution_id, name, client_code, custodian, status)
                        VALUES (@iid, @name, @code, @custodian, @status)
                        """, new { iid, name = sc.Name, code = sc.Code, custodian = sc.Custodian, status = sc.Status }, tx);
                return iid;
            });

            await Audit.LogActivity(db, ctx, "institution", id, "created",
                $"Client added{(schemes.Count > 0 ? $" with {schemes.Count} scheme(s)" : "")}");
            return Results.Json(new { id }, statusCode: 201);
        });

        app.MapPut("/api/institutions/{id:int}", async (HttpContext ctx, Db db, int id, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("institutional.edit");
            var schemes = ReadSchemes(b);
            var houseCode = b.OptStr("house_code")?.Trim().ToUpperInvariant();
            await AssertCodesFree(db, [houseCode, .. schemes.Select(x => x.Code)], id);

            await db.Tx<int>(async (conn, tx) =>
            {
                await conn.ExecuteAsync("""
                    UPDATE institutions SET name = @name, house_code = @houseCode, inst_type = @instType,
                           tier = @tier, empanelment = @empanelment, rm_id = @rm, country_id = @country,
                           city = @city, aum_cr = @aum, contact_name = @contactName,
                           contact_role = @contactRole, contact_email = @contactEmail, note = @note
                     WHERE id = @id
                    """, new
                {
                    id,
                    name = b.Str("name"),
                    houseCode,
                    instType = b.Str("inst_type"),
                    tier = b.Choice("tier", ["A", "B", "C"], "C"),
                    empanelment = b.OptStr("empanelment") ?? "In process",
                    rm = b.Int("rm_id"),
                    country = b.OptInt("country_id"),
                    city = b.OptStr("city"),
                    aum = b.Dec("aum_cr"),
                    contactName = b.OptStr("contact_name"),
                    contactRole = b.OptStr("contact_role"),
                    contactEmail = b.OptStr("contact_email"),
                    note = b.OptStr("note")
                }, tx);

                /* schemes carry brokerage, so keep the ones that are still there
                   rather than deleting and reinserting, which would orphan the trades */
                var keep = schemes.Where(x => x.Id is not null).Select(x => x.Id!.Value).ToArray();
                await conn.ExecuteAsync(
                    keep.Length > 0
                        ? "DELETE FROM institution_schemes WHERE institution_id = @id AND NOT (id = ANY(@keep))"
                        : "DELETE FROM institution_schemes WHERE institution_id = @id",
                    new { id, keep }, tx);

                foreach (var sc in schemes)
                {
                    if (sc.Id is not null)
                        await conn.ExecuteAsync("""
                            UPDATE institution_schemes SET name = @name, client_code = @code,
                                   custodian = @custodian, status = @status WHERE id = @sid
                            """, new
                        {
                            name = sc.Name,
                            code = sc.Code,
                            custodian = sc.Custodian,
                            status = sc.Status,
                            sid = sc.Id
                        }, tx);
                    else
                        await conn.ExecuteAsync("""
                            INSERT INTO institution_schemes (institution_id, name, client_code, custodian, status)
                            VALUES (@id, @name, @code, @custodian, @status)
                            """, new
                        {
                            id,
                            name = sc.Name,
                            code = sc.Code,
                            custodian = sc.Custodian,
                            status = sc.Status
                        }, tx);
                }
                return 0;
            });

            await Audit.LogActivity(db, ctx, "institution", id, "updated", "Client updated");
            return Results.Json(new { ok = true });
        });

        /* ----------------------------------------------------------- movement */
        app.MapGet("/api/institutions/visits/all", async (HttpContext ctx, Db db) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("institutional.view");
            var s = Scope.Institution(u);
            var where = new List<string> { s.Sql };
            var p = new DynamicParameters();
            p.Add("people", s.People); p.Add("uid", s.UserId);

            var qs = ctx.Request.Query;
            if (!string.IsNullOrEmpty(qs["from"])) { where.Add("v.visit_date >= CAST(@from AS date)"); p.Add("from", (string)qs["from"]!); }
            if (!string.IsNullOrEmpty(qs["to"])) { where.Add("v.visit_date <= CAST(@to AS date)"); p.Add("to", (string)qs["to"]!); }
            if (!string.IsNullOrEmpty(qs["by"])) { where.Add("v.logged_by = @by"); p.Add("by", int.Parse(qs["by"]!)); }

            return Results.Json(await db.Q($"""
                SELECT v.*, i.name AS client, u.name AS logged_by_name,
                       (SELECT STRING_AGG(symbol, ',') FROM client_visit_stocks
                         WHERE visit_id = v.id) AS stocks
                  FROM client_visits v
                  JOIN institutions i ON i.id = v.institution_id
                  JOIN users u ON u.id = v.logged_by
                 WHERE {string.Join(" AND ", where)} ORDER BY v.visit_date DESC LIMIT 500
                """, p));
        });

        app.MapPost("/api/institutions/{id:int}/visits", async (HttpContext ctx, Db db, int id, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("institutional.create");

            var visitId = await db.Tx(async (conn, tx) =>
            {
                var vid = await conn.ExecuteScalarAsync<long>("""
                    INSERT INTO client_visits
                      (institution_id, visit_date, visit_type, logged_by, met_person, city, agenda,
                       outcome, interest, follow_up_on, source, transcript)
                    VALUES (@id, CAST(@date AS date), @type, @me, @person, @city, @agenda, @outcome,
                            @interest, CAST(@followUp AS date), @source, @transcript)
                    RETURNING id
                    """, new
                {
                    id,
                    date = b.Str("visit_date"),
                    type = b.Str("visit_type"),
                    me = u.Id,
                    person = b.OptStr("met_person"),
                    city = b.OptStr("city"),
                    agenda = b.OptStr("agenda"),
                    outcome = b.OptStr("outcome"),
                    interest = b.Choice("interest", ["High", "Medium", "Low"], "Medium"),
                    followUp = b.OptStr("follow_up_on"),
                    source = b.Choice("source", ["typed", "voice", "import"], "typed"),
                    transcript = b.OptStr("transcript")
                }, tx);

                foreach (var symbol in b.StrArray("stocks")
                             .Select(x => x.Trim().ToUpperInvariant())
                             .Where(x => x.Length > 0).Distinct())
                    await conn.ExecuteAsync(
                        "INSERT INTO client_visit_stocks (visit_id, symbol) VALUES (@vid, @symbol)",
                        new { vid, symbol }, tx);
                return vid;
            });

            var person = b.OptStr("met_person");
            await Audit.LogActivity(db, ctx, "institution", id, "visit_logged",
                $"{b.Str("visit_type")}{(person is not null ? $" with {person}" : "")}");
            return Results.Json(new { id = visitId }, statusCode: 201);
        });

        /* PUT /api/institutions/visits/{id} — edit a logged interaction. */
        app.MapPut("/api/institutions/visits/{id:long}", async (HttpContext ctx, Db db, long id, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("institutional.edit");

            await db.Tx<int>(async (conn, tx) =>
            {
                var n = await conn.ExecuteAsync("""
                    UPDATE client_visits
                       SET visit_date = CAST(@date AS date), visit_type = @type, met_person = @person,
                           city = @city, agenda = @agenda, outcome = @outcome, interest = @interest,
                           follow_up_on = CAST(@followUp AS date)
                     WHERE id = @id
                    """, new
                {
                    date = b.Str("visit_date"),
                    type = b.Str("visit_type"),
                    person = b.OptStr("met_person"),
                    city = b.OptStr("city"),
                    agenda = b.OptStr("agenda"),
                    outcome = b.OptStr("outcome"),
                    interest = b.Choice("interest", ["High", "Medium", "Low"], "Medium"),
                    followUp = b.OptStr("follow_up_on"),
                    id
                }, tx);
                if (n == 0) throw AppException.NotFound();

                await conn.ExecuteAsync("DELETE FROM client_visit_stocks WHERE visit_id = @id", new { id }, tx);
                foreach (var symbol in b.StrArray("stocks")
                             .Select(x => x.Trim().ToUpperInvariant()).Where(x => x.Length > 0).Distinct())
                    await conn.ExecuteAsync(
                        "INSERT INTO client_visit_stocks (visit_id, symbol) VALUES (@id, @symbol)",
                        new { id, symbol }, tx);
                return 0;
            });

            await Audit.LogActivity(db, ctx, "institution", 0, "visit_edited", $"Interaction updated: {b.Str("visit_type")}");
            return Results.Json(new { ok = true });
        });
    }
}

public static class BrokerageEndpoints
{
    /* A code in the file wins: back-office exports carry codes, not names. */
    private static async Task<(int InstitutionId, int? SchemeId, string? Code)?> ResolveTarget(Db db, B row)
    {
        var code = row.OptStr("client_code")?.Trim().ToUpperInvariant();
        if (!string.IsNullOrEmpty(code))
        {
            var hit = await db.One("""
                SELECT s.id AS scheme_id, s.institution_id, s.client_code
                  FROM institution_schemes s WHERE s.client_code = @code
                """, new { code });
            if (hit is not null)
                return ((int)hit.institution_id, (int)hit.scheme_id, (string)hit.client_code);

            var house = await db.One(
                "SELECT id, house_code FROM institutions WHERE house_code = @code", new { code });
            if (house is not null) return ((int)house.id, null, (string)house.house_code);
        }
        var instId = row.OptInt("institution_id");
        if (instId is not null) return (instId.Value, row.OptInt("scheme_id"), null);
        return null;
    }

    private static string? Month(B row) =>
        row.OptStr("period_month")
        ?? (row.OptStr("trade_date") is { Length: >= 7 } d ? d[..7] : null);

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/brokerage", async (HttpContext ctx, Db db) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("institutional.view");
            var s = Scope.Institution(u);
            return Results.Json(await db.Q($"""
                SELECT b.*, i.name AS client, sc.name AS scheme
                  FROM brokerage b
                  JOIN institutions i ON i.id = b.institution_id
                  LEFT JOIN institution_schemes sc ON sc.id = b.scheme_id
                 WHERE {s.Sql} ORDER BY b.period_month DESC, i.name LIMIT 1000
                """, new { people = s.People, uid = s.UserId }));
        });

        /* Six-month contribution grid, which is what the desk actually looks at. */
        app.MapGet("/api/brokerage/summary", async (HttpContext ctx, Db db) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("institutional.view");
            var s = Scope.Institution(u);
            return Results.Json(await db.Q($"""
                SELECT b.period_month, i.name AS client, sc.name AS scheme, b.segment,
                       SUM(b.turnover) AS turnover, SUM(b.brokerage) AS brokerage
                  FROM brokerage b
                  JOIN institutions i ON i.id = b.institution_id
                  LEFT JOIN institution_schemes sc ON sc.id = b.scheme_id
                 WHERE {s.Sql}
                   AND b.period_month >= to_char(CURRENT_DATE - INTERVAL '5 months', 'YYYY-MM')
                 GROUP BY b.period_month, i.name, sc.name, b.segment
                 ORDER BY b.period_month
                """, new { people = s.People, uid = s.UserId }));
        });

        app.MapPost("/api/brokerage", async (HttpContext ctx, Db db, B b) =>
 {
     var u = (CurrentUser)ctx.Items["user"]!;
     u.Require("institutional.create");

     var target = await ResolveTarget(db, b)
         ?? throw AppException.BadRequest("No client matched — send an institution_id or a known client code");

     var month = Month(b)
         ?? throw AppException.BadRequest("A trade date or a period month is needed");

     var (instId, schemeId, code) = target;
     await db.Exec("""
        INSERT INTO brokerage
          (institution_id, scheme_id, client_code, trade_date, period_month, segment,
           turnover, brokerage, source, created_by)
        VALUES (@inst, @scheme, @code, CAST(@date AS date), @month, @segment,
                @turnover, @amount, 'manual', @me)
        """, new
     {
         inst = instId,
         scheme = schemeId,
         code = code,
         date = b.OptStr("trade_date"),
         month,
         segment = b.Choice("segment", ["Cash", "F&O", "Block / Bulk"], "Cash"),
         turnover = b.Dec("turnover"),
         amount = b.Dec("brokerage"),
         me = u.Id
     });

     await Audit.LogActivity(db, ctx, "institution", instId,
         "brokerage_booked", $"{b.OptStr("segment") ?? "Cash"} {b.Dec("brokerage")}");

     return Results.Json(new { ok = true }, statusCode: 201);
 });

        /* POST /api/brokerage/import — takes parsed rows and reports what it
           did rather than failing the lot: duplicates are skipped on the
           unique key, unknown codes come back listed. */
        app.MapPost("/api/brokerage/import", async (HttpContext ctx, Db db, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("institutional.create");
            var rows = b.ObjArray("rows");
            var skipDuplicates = b.Bool("skipDuplicates", true);

            int imported = 0, skipped = 0;
            var unmatched = new List<string>();

            await db.Tx<int>(async (conn, tx) =>
            {
                foreach (var row in rows)
                {
                    var target = await ResolveTarget(db, row);
                    if (target is null)
                    {
                        unmatched.Add(row.OptStr("client_code") ?? "(no code)");
                        continue;
                    }
                    var month = Month(row);
                    if (month is null) { skipped++; continue; }

                    var (instId, schemeId, code) = target.Value;
                    var affected = await conn.ExecuteAsync($"""
                INSERT INTO brokerage
                  (institution_id, scheme_id, client_code, trade_date, period_month, segment,
                   turnover, brokerage, source, created_by)
                VALUES (@inst, @scheme, @code, CAST(@date AS date), @month, @segment,
                        @turnover, @amount, 'import', @me)
                {(skipDuplicates ? "ON CONFLICT DO NOTHING" : "")}
                """, new
                    {
                        inst = instId,
                        scheme = schemeId,
                        code = code,
                        date = row.OptStr("trade_date"),
                        month,
                        segment = row.Choice("segment", ["Cash", "F&O", "Block / Bulk"], "Cash"),
                        turnover = row.Dec("turnover"),
                        amount = row.Dec("brokerage"),
                        me = u.Id
                    }, tx);
                    if (affected > 0) imported++; else skipped++;
                }
                return 0;
            });

            await Audit.LogActivity(db, ctx, "institution", 0, "brokerage_import",
                $"{imported} imported, {skipped} skipped");
            return Results.Json(new { imported, skipped, unmatched });
        });
    }
}