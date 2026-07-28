/* =====================================================================
   Endpoints that back the app shell: notifications, global search, and the
   sidebar counters. All read the signed-in user's own data from Postgres.
   ===================================================================== */
using System.Text.Json;
using AshikaWdm.Infrastructure;
using Dapper;

namespace AshikaWdm.Endpoints;

using B = Dictionary<string, JsonElement>;

public static class ShellEndpoints
{
    public static void Map(WebApplication app)
    {
        /* --------------------------------------------------- notifications */
        app.MapGet("/api/notifications", async (HttpContext ctx, Db db) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            var items = await db.Q("""
                SELECT id, type, title, message, entity_type, entity_id, is_read,
                       to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
                  FROM notifications
                 WHERE user_id = @uid
                 ORDER BY created_at DESC, id DESC LIMIT 50
                """, new { uid = u.Id });
            var unread = await db.Scalar<long>(
                "SELECT COUNT(*) FROM notifications WHERE user_id = @uid AND is_read::integer = 0",
                new { uid = u.Id });
            return Results.Json(new { unread, items });
        });

        app.MapPost("/api/notifications/read", async (HttpContext ctx, Db db, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            if (b.OptInt("id") is { } id)
                await db.Exec("UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = @id AND user_id = @uid",
                    new { id, uid = u.Id });
            else
                await db.Exec("UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = @uid AND is_read::integer = 0",
                    new { uid = u.Id });
            return Results.Json(new { ok = true });
        });

        /* --------------------------------------------------- global search */
        app.MapGet("/api/search", async (HttpContext ctx, Db db) =>
        {
            var term = ctx.Request.Query["q"].ToString();
            if (string.IsNullOrWhiteSpace(term) || term.Length < 2) return Results.Json(Array.Empty<object>());
            var q = $"%{term}%";
            var results = await db.Q("""
                SELECT 'opportunity' AS kind, o.id, o.opportunity_no AS ref, a.name AS label, o.stage AS sub
                  FROM opportunities o JOIN accounts a ON a.id = o.account_id
                 WHERE o.deleted_at IS NULL AND (o.opportunity_no ILIKE @q OR a.name ILIKE @q)
                UNION ALL
                SELECT 'account', a.id, a.account_code, a.name, a.account_type
                  FROM accounts a WHERE a.deleted_at IS NULL AND (a.account_code ILIKE @q OR a.name ILIKE @q)
                UNION ALL
                SELECT 'institution', i.id, i.institution_ref, i.name, i.inst_type
                  FROM institutions i WHERE i.name ILIKE @q OR i.institution_ref ILIKE @q OR i.house_code ILIKE @q
                UNION ALL
                SELECT 'assignment', a.id, a.assignment_no, a.title, a.status
                  FROM assignments a WHERE a.deleted_at IS NULL AND (a.assignment_no ILIKE @q OR a.title ILIKE @q)
                UNION ALL
                SELECT 'user', u.id, u.employee_code, u.name, u.email
                  FROM users u WHERE u.name ILIKE @q OR u.email ILIKE @q OR u.employee_code ILIKE @q
                 LIMIT 25
                """, new { q });
            return Results.Json(results);
        });

        /* ---------------------------------------------------- nav counters */
        app.MapGet("/api/nav-counts", async (HttpContext ctx, Db db) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            var row = await db.One("""
                SELECT
                  (SELECT COUNT(*) FROM assignments WHERE deleted_at IS NULL AND status <> 'Completed') AS tasks,
                  (SELECT COUNT(*) FROM opportunities WHERE deleted_at IS NULL AND is_converted::integer = 0
                     AND stage IN ('Lead','Qualified','Pitched','Term Sheet','Mandated')) AS opps,
                  (SELECT COUNT(*) FROM accounts WHERE deleted_at IS NULL AND status = 'Active') AS accounts,
                  (SELECT COUNT(*) FROM work_approvals WHERE status = 'Pending') AS wapprovals,
                  (SELECT COUNT(*) FROM institutions WHERE status = 'Active') AS clients,
                  (SELECT COUNT(*) FROM research_reports WHERE status = 'Draft') AS reports_draft,
                  (SELECT COUNT(*) FROM client_visits WHERE visit_date = CURRENT_DATE) AS visits_today,
                  (SELECT COUNT(*) FROM notifications WHERE user_id = @uid AND is_read::integer = 0) AS notifications
                """, new { uid = u.Id });
            return Results.Json((object)row!);
        });
    }
}
