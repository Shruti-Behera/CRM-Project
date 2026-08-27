using System.Text.Json;
using AshikaWdm.Infrastructure;
using Dapper;
using Npgsql;

namespace AshikaWdm.Endpoints;

using B = Dictionary<string, JsonElement>;

public static class AccountEndpoints
{
    private static readonly string[] Types =
        ["Corporate", "Promoter / Family Office", "PE / VC Fund", "FII / DII", "HNI", "Bank / NBFC"];
    private static readonly string[] Kyc = ["Pending", "Under Review", "Completed"];
    private static readonly string[] Statuses = ["Active", "Dormant", "Blacklisted"];

    /* Writes the account's single primary contact (when a name is given) and its
       chosen preferences. Shared by create and edit; the caller clears the old
       rows first on edit. is_primary is written as the string literal '1' so it
       coerces correctly whether the column is a smallint or a real boolean. */
    private static async Task WriteContactAndPrefs(NpgsqlConnection conn, NpgsqlTransaction tx, int accountId, B b)
    {
        var name = b.OptStr("contact_name");
        if (!string.IsNullOrWhiteSpace(name))
            await conn.ExecuteAsync("""
                INSERT INTO account_contacts (account_id, name, designation, email, is_primary)
                VALUES (@aid, @name, @role, @email, '1')
                """, new { aid = accountId, name, role = b.OptStr("contact_designation"), email = b.OptStr("contact_email") }, tx);

        foreach (var pid in b.IntArray("preference_ids"))
            await conn.ExecuteAsync("""
                INSERT INTO account_preferences (account_id, preference_id) VALUES (@aid, @pid)
                ON CONFLICT DO NOTHING
                """, new { aid = accountId, pid }, tx);
    }

    private static (string Sql, int[] People, int? DivisionId, int UserId) Scope(CurrentUser u) => u.ScopeKind switch
    {
        "all" => ("1=1", Array.Empty<int>(), null, u.Id),
        "team" => ("(a.owner_id = ANY(@people) OR (CAST(@divId AS int) IS NOT NULL AND a.division_id = @divId))",
                   u.People ?? Array.Empty<int>(), u.DivisionId, u.Id),
        _ => ("a.owner_id = @uid", Array.Empty<int>(), null, u.Id)
    };

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/accounts", async (HttpContext ctx, Db db) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("accounts.view");
            var (scopeSql, people, divId, uid) = Scope(u);
            var where = new List<string> { scopeSql, "a.deleted_at IS NULL" };
            var p = new DynamicParameters();
            p.Add("people", people); p.Add("divId", divId); p.Add("uid", uid);

            var qs = ctx.Request.Query;
            if (!string.IsNullOrEmpty(qs["type"])) { where.Add("a.account_type = @type"); p.Add("type", (string)qs["type"]!); }
            if (!string.IsNullOrEmpty(qs["sector"])) { where.Add("s.name = @sector"); p.Add("sector", (string)qs["sector"]!); }
            if (!string.IsNullOrEmpty(qs["owner"])) { where.Add("o.name = @owner"); p.Add("owner", (string)qs["owner"]!); }
            if (!string.IsNullOrEmpty(qs["q"]))
            {
                where.Add("(a.name ILIKE @q OR a.account_code ILIKE @q OR a.city ILIKE @q)");
                p.Add("q", $"%{qs["q"]}%");
            }

            return Results.Json(await db.Q($"""
                SELECT a.id, a.account_code, a.name, a.account_type, a.city, a.kyc_status, a.remark,
                       a.fees_to_date, a.status, a.owner_id, a.division_id, a.group_id, a.sector_id, a.country_id,
                       a.client_since, a.phone_code, a.phone_number, a.mobile_code, a.mobile_number,
                       o.name AS owner, g.name AS group_name, s.name AS sector, c.name AS country,
                       (SELECT ac.name FROM account_contacts ac
                         WHERE ac.account_id = a.id AND ac.is_primary::integer = 1
                         ORDER BY ac.id LIMIT 1) AS contact,
                       (SELECT ac.designation FROM account_contacts ac
                         WHERE ac.account_id = a.id AND ac.is_primary::integer = 1
                         ORDER BY ac.id LIMIT 1) AS contact_designation,
                       (SELECT ac.email FROM account_contacts ac
                         WHERE ac.account_id = a.id AND ac.is_primary::integer = 1
                         ORDER BY ac.id LIMIT 1) AS contact_email,
                       (SELECT COUNT(*) FROM opportunities op
                         WHERE op.account_id = a.id AND op.deleted_at IS NULL AND op.is_converted::integer = 0
                           AND op.stage IN ('Lead','Qualified','Pitched','Term Sheet','Mandated')) AS live_opps,
                       (SELECT COUNT(*) FROM mandates m WHERE m.account_id = a.id AND m.deleted_at IS NULL) AS mandates
                  FROM accounts a
                  JOIN users o ON o.id = a.owner_id
                  LEFT JOIN client_groups g ON g.id = a.group_id
                  LEFT JOIN sectors s ON s.id = a.sector_id
                  LEFT JOIN countries c ON c.id = a.country_id
                 WHERE {string.Join(" AND ", where)}
                 ORDER BY a.name
                """, p));
        });

        app.MapGet("/api/accounts/{id:int}", async (HttpContext ctx, Db db, int id) =>
        {
            ((CurrentUser)ctx.Items["user"]!).Require("accounts.view");
            var row = await db.One("""
                SELECT a.*, o.name AS owner, g.name AS group_name, s.name AS sector,
                       c.name AS country, dv.name AS division
                  FROM accounts a
                  JOIN users o ON o.id = a.owner_id
                  LEFT JOIN client_groups g ON g.id = a.group_id
                  LEFT JOIN sectors s ON s.id = a.sector_id
                  LEFT JOIN countries c ON c.id = a.country_id
                  LEFT JOIN divisions dv ON dv.id = a.division_id
                 WHERE a.id = @id AND a.deleted_at IS NULL
                """, new { id }) ?? throw AppException.NotFound("No such account");
            row.opportunities = await db.Q("""
                SELECT o.id, o.opportunity_no, o.stage, o.txn_size_cr, o.expected_fee_l,
                       o.probability_pct, o.expected_close, dt.name AS deal_type
                  FROM opportunities o JOIN deal_types dt ON dt.id = o.deal_type_id
                 WHERE o.account_id = @id AND o.deleted_at IS NULL ORDER BY o.created_at DESC
                """, new { id });
            row.mandates = await db.Q("""
                SELECT m.id, m.mandate_no, m.status, m.estimated_fee_l, m.realised_fee_l,
                       m.signed_on, dt.name AS deal_type
                  FROM mandates m JOIN deal_types dt ON dt.id = m.deal_type_id
                 WHERE m.account_id = @id AND m.deleted_at IS NULL ORDER BY m.signed_on DESC
                """, new { id });
            // Primary contact + preference ids (edit prefill) + names (detail display).
            row.contact = await db.One("""
                SELECT name, designation, email FROM account_contacts
                 WHERE account_id = @id AND is_primary::integer = 1 ORDER BY id LIMIT 1
                """, new { id });
            row.preference_ids = (await db.Q(
                "SELECT preference_id FROM account_preferences WHERE account_id = @id", new { id }))
                .Select(r => (int)r.preference_id).ToArray();
            row.preferences = await db.Q("""
                SELECT p.name FROM account_preferences ap JOIN preferences p ON p.id = ap.preference_id
                 WHERE ap.account_id = @id ORDER BY p.name
                """, new { id });
            row.notes = await db.Q("""
                SELECT n.id, n.note_at, n.comment, u.name AS author
                  FROM account_notes n JOIN users u ON u.id = n.user_id
                 WHERE n.account_id = @id ORDER BY n.note_at DESC
                """, new { id });
            row.activity = await db.Q("""
                SELECT a.action, a.description, a.created_at, u.name AS who
                  FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
                 WHERE a.entity_type = 'account' AND a.entity_id = @id
                 ORDER BY a.created_at DESC LIMIT 100
                """, new { id });
            return Results.Json((object)row);
        });

        /* Relationship note on an account (detail page). */
        app.MapPost("/api/accounts/{id:int}/notes", async (HttpContext ctx, Db db, int id, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("accounts.view");
            var comment = b.Str("comment");
            await db.Exec("""
                INSERT INTO account_notes (account_id, user_id, note_at, comment)
                VALUES (@id, @me, NOW(), @comment)
                """, new { id, me = u.Id, comment });
            await Audit.LogActivity(db, ctx, "account", id, "note", "Note added");
            return Results.Json(new { ok = true }, statusCode: 201);
        });

        /* City list for the account form's country-dependent city dropdown. */
        app.MapGet("/api/lookups/cities", async (HttpContext ctx, Db db) =>
        {
            ((CurrentUser)ctx.Items["user"]!).Require("accounts.view");
            return Results.Json(await db.Q(
                "SELECT id, country_id, name FROM country_cities ORDER BY name"));
        });

        app.MapPost("/api/accounts", async (HttpContext ctx, Db db, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("accounts.create");
            var ownerId = b.OptInt("owner_id") ?? u.Id;
            var id = await db.Tx(async (conn, tx) =>
            {
                var code = await Db.NextNo(conn, tx, "accounts", "account_code", "ACC");
                var aid = await conn.ExecuteScalarAsync<int>("""
                    INSERT INTO accounts
                      (account_code, name, division_id, group_id, sector_id, account_type, owner_id,
                       country_id, city, client_since, kyc_status, phone_code, phone_number,
                       mobile_code, mobile_number, fees_to_date, remark, status, created_by)
                    VALUES (@code, @name, @division, @group, @sector, @type, @owner,
                            @country, @city, CAST(@since AS date), @kyc, @phoneCode, @phoneNo,
                            @mobCode, @mobNo, @fees, @remark, @status, @me)
                    RETURNING id
                    """, new
                {
                    code,
                    name = b.Str("name"),
                    division = b.OptInt("division_id"),
                    group = b.OptInt("group_id"),
                    sector = b.OptInt("sector_id"),
                    type = b.Choice("account_type", Types, "Corporate"),
                    owner = ownerId,
                    country = b.OptInt("country_id"),
                    city = b.OptStr("city"),
                    since = b.OptStr("client_since"),
                    kyc = b.Choice("kyc_status", Kyc, "Pending"),
                    phoneCode = b.OptStr("phone_code"), phoneNo = b.OptStr("phone_number"),
                    mobCode = b.OptStr("mobile_code"), mobNo = b.OptStr("mobile_number"),
                    fees = b.Dec("fees_to_date"),
                    remark = b.OptStr("remark"),
                    status = b.Choice("status", Statuses, "Active"),
                    me = u.Id
                }, tx);

                await WriteContactAndPrefs(conn, tx, aid, b);
                return aid;
            });
            await Audit.LogActivity(db, ctx, "account", id, "created", $"Account created: {b.Str("name")}");
            if (ownerId != u.Id)
                await Audit.Notify(db, ownerId, "Account", "New account assigned to you",
                    $"{b.Str("name")} was added with you as relationship owner.", "account", id, u.Id);
            return Results.Json(new { id }, statusCode: 201);
        });

        app.MapPut("/api/accounts/{id:int}", async (HttpContext ctx, Db db, int id, B b) =>
        {
            ((CurrentUser)ctx.Items["user"]!).Require("accounts.edit");
            await db.Tx<int>(async (conn, tx) =>
            {
                await conn.ExecuteAsync("""
                    UPDATE accounts SET name = @name, division_id = @division, group_id = @group,
                           sector_id = @sector, account_type = @type, owner_id = @owner, country_id = @country,
                           city = @city, client_since = CAST(@since AS date), kyc_status = @kyc,
                           phone_code = @phoneCode, phone_number = @phoneNo,
                           mobile_code = @mobCode, mobile_number = @mobNo, fees_to_date = @fees,
                           remark = @remark, status = @status, updated_at = NOW()
                     WHERE id = @id AND deleted_at IS NULL
                    """, new
                {
                    name = b.Str("name"),
                    division = b.OptInt("division_id"),
                    group = b.OptInt("group_id"),
                    sector = b.OptInt("sector_id"),
                    type = b.Choice("account_type", Types, "Corporate"),
                    owner = b.Int("owner_id"),
                    country = b.OptInt("country_id"),
                    city = b.OptStr("city"),
                    since = b.OptStr("client_since"),
                    kyc = b.Choice("kyc_status", Kyc, "Pending"),
                    phoneCode = b.OptStr("phone_code"), phoneNo = b.OptStr("phone_number"),
                    mobCode = b.OptStr("mobile_code"), mobNo = b.OptStr("mobile_number"),
                    fees = b.Dec("fees_to_date"),
                    remark = b.OptStr("remark"),
                    status = b.Choice("status", Statuses, "Active"),
                    id
                }, tx);

                // Replace the primary contact and the preference set from the form.
                await conn.ExecuteAsync(
                    "DELETE FROM account_contacts WHERE account_id = @id AND is_primary::integer = 1", new { id }, tx);
                await conn.ExecuteAsync("DELETE FROM account_preferences WHERE account_id = @id", new { id }, tx);
                await WriteContactAndPrefs(conn, tx, id, b);
                return 0;
            });
            await Audit.LogActivity(db, ctx, "account", id, "updated", "Account updated");
            return Results.Json(new { ok = true });
        });

        app.MapDelete("/api/accounts/{id:int}", async (HttpContext ctx, Db db, int id) =>
        {
            ((CurrentUser)ctx.Items["user"]!).Require("accounts.delete");
            var n = await db.Exec("UPDATE accounts SET deleted_at = NOW() WHERE id = @id AND deleted_at IS NULL", new { id });
            if (n == 0) throw AppException.NotFound();
            await Audit.LogActivity(db, ctx, "account", id, "deleted", "Account removed");
            return Results.Json(new { ok = true });
        });
    }
}
