using System.Text.Json;
using AshikaWdm.Infrastructure;
using Dapper;

namespace AshikaWdm.Endpoints;

using B = Dictionary<string, JsonElement>;

public static class ResearchReportEndpoints
{
    private static readonly string[] Types =
        ["Sector report", "Stock initiation", "Stock update", "Result update",
         "Event update", "Thematic", "Model portfolio", "Morning note"];
    private static readonly string[] Recos =
        ["Buy", "Accumulate", "Hold", "Reduce", "Sell", "Not rated"];

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/research-reports", async (HttpContext ctx, Db db) =>
        {
            ((CurrentUser)ctx.Items["user"]!).Require("research.view");
            var where = new List<string> { "1=1" };
            var p = new DynamicParameters();
            var qs = ctx.Request.Query;
            if (!string.IsNullOrEmpty(qs["type"])) { where.Add("r.report_type = @type"); p.Add("type", (string)qs["type"]!); }
            if (!string.IsNullOrEmpty(qs["status"])) { where.Add("r.status = @status"); p.Add("status", (string)qs["status"]!); }
            if (!string.IsNullOrEmpty(qs["reco"])) { where.Add("r.recommendation = @reco"); p.Add("reco", (string)qs["reco"]!); }
            if (!string.IsNullOrEmpty(qs["q"]))
            {
                where.Add("(r.title ILIKE @q OR r.symbol ILIKE @q OR r.report_no ILIKE @q)");
                p.Add("q", $"%{qs["q"]}%");
            }
            return Results.Json(await db.Q($"""
                SELECT r.id, r.report_no, r.title, r.report_type, r.symbol, r.recommendation,
                       r.cmp, r.target_price, r.upside_pct,
                       to_char(r.report_date, 'YYYY-MM-DD') AS report_date, r.status,
                       s.name AS sector, u.name AS analyst
                  FROM research_reports r
                  LEFT JOIN sectors s ON s.id = r.sector_id
                  JOIN users u ON u.id = r.analyst_id
                 WHERE {string.Join(" AND ", where)}
                 ORDER BY r.report_date DESC, r.id DESC
                """, p));
        });

        app.MapPost("/api/research-reports", async (HttpContext ctx, Db db, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("research.create");

            var status = b.Choice("status", ["Draft", "Published"], "Draft");
            var id = await db.Tx(async (conn, tx) =>
            {
                var no = await Db.NextNo(conn, tx, "research_reports", "report_no", "REP", fyPrefix: true);
                return await conn.ExecuteScalarAsync<int>("""
                    INSERT INTO research_reports
                      (report_no, title, report_type, sector_id, symbol, analyst_id, recommendation,
                       cmp, target_price, report_date, summary, status, published_at)
                    VALUES (@no, @title, @type, @sector, @symbol, @analyst, @reco,
                            @cmp, @target, CAST(@date AS date), @summary, @status,
                            CASE WHEN @status = 'Published' THEN NOW() ELSE NULL END)
                    RETURNING id
                    """, new
                {
                    no,
                    title = b.Str("title"),
                    type = b.Choice("report_type", Types, "Stock update"),
                    sector = b.OptInt("sector_id"),
                    symbol = b.OptStr("symbol"),
                    analyst = b.OptInt("analyst_id") ?? u.Id,
                    reco = b.Choice("recommendation", Recos, "Not rated"),
                    cmp = b.Dec("cmp"),
                    target = b.Dec("target_price"),
                    date = b.OptStr("report_date") ?? DateTime.Now.ToString("yyyy-MM-dd"),
                    summary = b.OptStr("summary"),
                    status
                }, tx);
            });

            await Audit.LogActivity(db, ctx, "research_report", id, "created", $"Report raised: {b.Str("title")}");
            return Results.Json(new { id }, statusCode: 201);
        });

        app.MapPatch("/api/research-reports/{id:int}", async (HttpContext ctx, Db db, int id, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("research.edit");
            var status = b.Choice("status", ["Draft", "Published"], "Draft");
            await db.Exec("""
                UPDATE research_reports
                   SET status = @status,
                       published_at = CASE WHEN @status = 'Published' THEN COALESCE(published_at, NOW()) ELSE NULL END
                 WHERE id = @id
                """, new { status, id });
            await Audit.LogActivity(db, ctx, "research_report", id, "status", $"Report {status.ToLowerInvariant()}");
            if (status == "Published")
            {
                var r = await db.One("SELECT analyst_id, title FROM research_reports WHERE id = @id", new { id });
                if (r is not null && (int)r.analyst_id != u.Id)
                    await Audit.Notify(db, (int)r.analyst_id, "Research", "Your report was published",
                        $"\"{(string)r.title}\" is now live to clients.", "research_report", id, u.Id);
            }
            return Results.Json(new { ok = true });
        });
    }
}
