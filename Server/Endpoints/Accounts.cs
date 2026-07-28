/* =====================================================================
   Banking accounts — the client and counterparty master. Ported to the
   server from the prototype's Accounts screen. Scope mirrors the banking
   rule: level 1/2 see all, level 3 their team/division, level 4 their own.
   ===================================================================== */
using System.Text.Json;
using AshikaWdm.Infrastructure;
using Dapper;

namespace AshikaWdm.Endpoints;

using B = Dictionary<string, JsonElement>;

public static class AccountEndpoints
{
    private static readonly string[] Types =
        ["Corporate", "Promoter / Family Office", "PE / VC Fund", "FII / DII", "HNI", "Bank / NBFC"];
    private static readonly string[] Kyc = ["Pending", "Under Review", "Completed"];
    private static readonly string[] Statuses = ["Active", "Dormant", "Blacklisted"];

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
                       a.client_since,
                       o.name AS owner, g.name AS group_name, s.name AS sector, c.name AS country,
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
                SELECT o.id, o.opportunity_no, o.stage, o.expected_fee_l, dt.name AS deal_type
                  FROM opportunities o JOIN deal_types dt ON dt.id = o.deal_type_id
                 WHERE o.account_id = @id AND o.deleted_at IS NULL ORDER BY o.created_at DESC
                """, new { id });
            row.mandates = await db.Q("""
                SELECT m.id, m.mandate_no, m.status, m.estimated_fee_l, m.realised_fee_l
                  FROM mandates m WHERE m.account_id = @id AND m.deleted_at IS NULL ORDER BY m.signed_on DESC
                """, new { id });
            return Results.Json((object)row);
        });

        app.MapPost("/api/accounts", async (HttpContext ctx, Db db, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("accounts.create");
            var id = await db.Tx(async (conn, tx) =>
            {
                var code = await Db.NextNo(conn, tx, "accounts", "account_code", "ACC");
                return await conn.ExecuteScalarAsync<int>("""
                    INSERT INTO accounts
                      (account_code, name, division_id, group_id, sector_id, account_type, owner_id,
                       country_id, city, client_since, kyc_status, remark, status, created_by)
                    VALUES (@code, @name, @division, @group, @sector, @type, @owner,
                            @country, @city, CAST(@since AS date), @kyc, @remark, @status, @me)
                    RETURNING id
                    """, new
                {
                    code,
                    name = b.Str("name"),
                    division = b.OptInt("division_id"),
                    group = b.OptInt("group_id"),
                    sector = b.OptInt("sector_id"),
                    type = b.Choice("account_type", Types, "Corporate"),
                    owner = b.OptInt("owner_id") ?? u.Id,
                    country = b.OptInt("country_id"),
                    city = b.OptStr("city"),
                    since = b.OptStr("client_since"),
                    kyc = b.Choice("kyc_status", Kyc, "Pending"),
                    remark = b.OptStr("remark"),
                    status = b.Choice("status", Statuses, "Active"),
                    me = u.Id
                }, tx);
            });
            await Audit.LogActivity(db, ctx, "account", id, "created", $"Account created: {b.Str("name")}");
            return Results.Json(new { id }, statusCode: 201);
        });

        app.MapPut("/api/accounts/{id:int}", async (HttpContext ctx, Db db, int id, B b) =>
        {
            ((CurrentUser)ctx.Items["user"]!).Require("accounts.edit");
            await db.Exec("""
                UPDATE accounts SET name = @name, division_id = @division, group_id = @group,
                       sector_id = @sector, account_type = @type, owner_id = @owner, country_id = @country,
                       city = @city, client_since = CAST(@since AS date), kyc_status = @kyc,
                       remark = @remark, status = @status
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
                remark = b.OptStr("remark"),
                status = b.Choice("status", Statuses, "Active"),
                id
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
