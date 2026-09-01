/* =====================================================================
   Admin data screens: holiday list, audit log, and the server-side
   equivalent of the prototype's Data & Backup (record counts + a JSON
   export straight from PostgreSQL, rather than the browser localStorage
   the local prototype used).
   ===================================================================== */
using System.Text.Json;
using AshikaWdm.Infrastructure;
using Dapper;

namespace AshikaWdm.Endpoints;

using B = Dictionary<string, JsonElement>;

public static class AdminEndpoints
{
    public static void Map(WebApplication app)
    {
        /* ---------------------------------------------------------- holidays */
        app.MapGet("/api/holidays", async (HttpContext ctx, Db db) =>
        {
            var hu = (CurrentUser)ctx.Items["user"]!;
            hu.RequireLevel(2);             // Masters module (Settings): Level 1 & 2 only
            hu.Require("users.view");
            return Results.Json(await db.Q("""
                SELECT id, to_char(holiday_date, 'YYYY-MM-DD') AS holiday_date, title
                  FROM holidays ORDER BY holiday_date
                """));
        });

        app.MapPost("/api/holidays", async (HttpContext ctx, Db db, B b) =>
        {
            ((CurrentUser)ctx.Items["user"]!).RequireSuperAdmin();
            var id = await db.Scalar<int>("""
                INSERT INTO holidays (holiday_date, title)
                VALUES (CAST(@date AS date), @title) RETURNING id
                """, new { date = b.Str("holiday_date"), title = b.Str("title") });
            await Audit.LogActivity(db, ctx, "holiday", id, "created", $"Holiday added: {b.Str("title")}");
            return Results.Json(new { id }, statusCode: 201);
        });

        app.MapPut("/api/holidays/{id:int}", async (HttpContext ctx, Db db, int id, B b) =>
        {
            ((CurrentUser)ctx.Items["user"]!).RequireSuperAdmin();
            var n = await db.Exec("""
                UPDATE holidays SET holiday_date = CAST(@date AS date), title = @title WHERE id = @id
                """, new { date = b.Str("holiday_date"), title = b.Str("title"), id });
            if (n == 0) throw AppException.NotFound();
            await Audit.LogActivity(db, ctx, "holiday", id, "updated", "Holiday updated");
            return Results.Json(new { ok = true });
        });

        app.MapDelete("/api/holidays/{id:int}", async (HttpContext ctx, Db db, int id) =>
        {
            ((CurrentUser)ctx.Items["user"]!).RequireSuperAdmin();
            await db.Exec("DELETE FROM holidays WHERE id = @id", new { id });
            await Audit.LogActivity(db, ctx, "holiday", id, "deleted", "Holiday removed");
            return Results.Json(new { ok = true });
        });

        /* --------------------------------------------------------- audit log */
        app.MapGet("/api/audit", async (HttpContext ctx, Db db) =>
        {
            var au = (CurrentUser)ctx.Items["user"]!;
            au.RequireLevel(2);             // Masters module (Settings → audit): Level 1 & 2 only
            au.Require("users.view");
            var where = new List<string> { "1=1" };
            var p = new DynamicParameters();
            var qs = ctx.Request.Query;
            if (!string.IsNullOrEmpty(qs["q"]))
            {
                where.Add("(a.description ILIKE @q OR u.name ILIKE @q OR a.action ILIKE @q)");
                p.Add("q", $"%{qs["q"]}%");
            }
            return Results.Json(await db.Q($"""
                SELECT a.id, COALESCE(u.name, 'system') AS who, a.action, a.description,
                       a.entity_type, a.entity_id,
                       to_char(a.created_at, 'YYYY-MM-DD HH24:MI') AS created_at
                  FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
                 WHERE {string.Join(" AND ", where)}
                 ORDER BY a.created_at DESC, a.id DESC LIMIT 300
                """, p));
        });

        /* --------------------------------------------------- data & backup */
        app.MapGet("/api/backup", async (HttpContext ctx, Db db) =>
        {
            var bu = (CurrentUser)ctx.Items["user"]!;
            bu.RequireLevel(2);             // Masters module (Data & backup): Level 1 & 2 only
            bu.Require("users.view");
            var row = await db.One("""
                SELECT
                  (SELECT COUNT(*) FROM accounts)       AS accounts,
                  (SELECT COUNT(*) FROM opportunities)  AS opportunities,
                  (SELECT COUNT(*) FROM mandates)       AS mandates,
                  (SELECT COUNT(*) FROM assignments)    AS assignments,
                  (SELECT COUNT(*) FROM users)          AS users,
                  (SELECT COUNT(*) FROM institutions)   AS institutions,
                  (SELECT COUNT(*) FROM meetings)       AS meetings,
                  (SELECT COUNT(*) FROM emails)         AS emails,
                  (SELECT COUNT(*) FROM work_approvals) AS work_approvals,
                  (SELECT COUNT(*) FROM activity_logs)  AS activity_logs
                """);
            return Results.Json((object)row!);
        });

        app.MapGet("/api/backup/export", async (HttpContext ctx, Db db) =>
        {
            ((CurrentUser)ctx.Items["user"]!).RequireSuperAdmin();
            var export = new
            {
                exported_at = DateTime.UtcNow,
                users = await db.Q("SELECT id, employee_code, name, email, mobile, designation, department_id, division_id, manager_id, role_id, status FROM users"),
                roles = await db.Q("SELECT * FROM roles"),
                departments = await db.Q("SELECT * FROM departments"),
                divisions = await db.Q("SELECT * FROM divisions"),
                categories = await db.Q("SELECT * FROM categories"),
                projects = await db.Q("SELECT * FROM projects"),
                work_types = await db.Q("SELECT * FROM work_types"),
                holidays = await db.Q("SELECT id, to_char(holiday_date,'YYYY-MM-DD') AS holiday_date, title FROM holidays"),
                accounts = await db.Q("SELECT * FROM accounts WHERE deleted_at IS NULL"),
                opportunities = await db.Q("SELECT * FROM opportunities WHERE deleted_at IS NULL"),
                mandates = await db.Q("SELECT * FROM mandates WHERE deleted_at IS NULL"),
                institutions = await db.Q("SELECT * FROM institutions"),
                assignments = await db.Q("SELECT * FROM assignments WHERE deleted_at IS NULL"),
                assignment_assignees = await db.Q("SELECT * FROM assignment_assignees"),
                meetings = await db.Q("SELECT * FROM meetings"),
                work_approvals = await db.Q("SELECT * FROM work_approvals")
            };
            await Audit.LogActivity(db, ctx, "backup", 0, "exported", "Data exported");
            return Results.Json(export);
        });
    }
}
