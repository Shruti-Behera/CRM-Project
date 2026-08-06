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
        // History + unread count. Paginated via ?limit & ?offset; hides soft-deleted.
        app.MapGet("/api/notifications", async (HttpContext ctx, Db db) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            var limit = int.TryParse(ctx.Request.Query["limit"], out var l) ? Math.Clamp(l, 1, 100) : 20;
            var offset = int.TryParse(ctx.Request.Query["offset"], out var o) ? Math.Max(o, 0) : 0;

            var items = await db.Q("""
                SELECT n.id, n.type, n.title, n.message, n.entity_type, n.entity_id, n.is_read,
                       s.name AS sender,
                       to_char(n.created_at, 'YYYY-MM-DD HH24:MI') AS created_at
                  FROM notifications n
                  LEFT JOIN users s ON s.id = n.sender_id
                 WHERE n.user_id = @uid AND n.is_deleted::integer = 0
                 ORDER BY n.created_at DESC, n.id DESC
                 LIMIT @limit OFFSET @offset
                """, new { uid = u.Id, limit, offset });
            var unread = await db.Scalar<long>(
                "SELECT COUNT(*) FROM notifications WHERE user_id = @uid AND is_read::integer = 0 AND is_deleted::integer = 0",
                new { uid = u.Id });
            var total = await db.Scalar<long>(
                "SELECT COUNT(*) FROM notifications WHERE user_id = @uid AND is_deleted::integer = 0",
                new { uid = u.Id });
            return Results.Json(new { unread, total, items });
        });

        // Real-time stream (Server-Sent Events). Authenticates via ?access_token
        // because EventSource can't send an Authorization header.
        app.MapGet("/api/notifications/stream", async (HttpContext ctx, NotifyStream stream, Tokens tokens) =>
        {
            var uid = tokens.Validate(ctx.Request.Query["access_token"].ToString());
            if (uid is null) { ctx.Response.StatusCode = 401; return; }

            ctx.Response.Headers.ContentType = "text/event-stream";
            ctx.Response.Headers.CacheControl = "no-cache";
            ctx.Response.Headers["X-Accel-Buffering"] = "no";

            var (id, reader) = stream.Subscribe(uid.Value);
            try
            {
                await ctx.Response.WriteAsync(": connected\n\n", ctx.RequestAborted);
                await ctx.Response.Body.FlushAsync(ctx.RequestAborted);
                while (!ctx.RequestAborted.IsCancellationRequested)
                {
                    var read = reader.ReadAsync(ctx.RequestAborted).AsTask();
                    var done = await Task.WhenAny(read, Task.Delay(25000, ctx.RequestAborted));
                    if (done == read) { await read; await ctx.Response.WriteAsync("data: notify\n\n", ctx.RequestAborted); }
                    else { await ctx.Response.WriteAsync(": ping\n\n", ctx.RequestAborted); }   // heartbeat
                    await ctx.Response.Body.FlushAsync(ctx.RequestAborted);
                }
            }
            catch (OperationCanceledException) { /* client went away */ }
            finally { stream.Unsubscribe(uid.Value, id); }
        });

        app.MapPost("/api/notifications/read", async (HttpContext ctx, Db db, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            if (b.OptInt("id") is { } id)
                await db.Exec("UPDATE notifications SET is_read = 1, read_at = NOW(), updated_at = NOW() WHERE id = @id AND user_id = @uid",
                    new { id, uid = u.Id });
            else
                await db.Exec("UPDATE notifications SET is_read = 1, read_at = NOW(), updated_at = NOW() WHERE user_id = @uid AND is_read::integer = 0",
                    new { uid = u.Id });
            return Results.Json(new { ok = true });
        });

        // Soft-delete a single notification.
        app.MapDelete("/api/notifications/{id:long}", async (HttpContext ctx, Db db, long id) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            await db.Exec("UPDATE notifications SET is_deleted = 1, updated_at = NOW() WHERE id = @id AND user_id = @uid",
                new { id, uid = u.Id });
            return Results.Json(new { ok = true });
        });

        // Clear all (soft-delete every notification for this user).
        app.MapDelete("/api/notifications", async (HttpContext ctx, Db db) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            await db.Exec("UPDATE notifications SET is_deleted = 1, updated_at = NOW() WHERE user_id = @uid AND is_deleted::integer = 0",
                new { uid = u.Id });
            return Results.Json(new { ok = true });
        });

        /* ----------------------------------- per-user notify preferences */
        app.MapGet("/api/me/preferences", async (HttpContext ctx, Db db) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            var row = await db.One(
                "SELECT pref_sound, pref_desktop FROM users WHERE id = @uid", new { uid = u.Id });
            return Results.Json(new
            {
                sound = row is null || Convert.ToInt32(row.pref_sound) == 1,
                desktop = row is null || Convert.ToInt32(row.pref_desktop) == 1
            });
        });

        app.MapPatch("/api/me/preferences", async (HttpContext ctx, Db db, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            var sets = new List<string>();
            var p = new DynamicParameters();
            p.Add("uid", u.Id);
            if (b.ContainsKey("sound")) { sets.Add("pref_sound = @sound"); p.Add("sound", b.Bool("sound") ? 1 : 0); }
            if (b.ContainsKey("desktop")) { sets.Add("pref_desktop = @desktop"); p.Add("desktop", b.Bool("desktop") ? 1 : 0); }
            if (sets.Count > 0)
                await db.Exec($"UPDATE users SET {string.Join(", ", sets)} WHERE id = @uid", p);
            return Results.Json(new { ok = true });
        });

        /* --------------------------------------------------- global search */
        app.MapGet("/api/search", async (HttpContext ctx, Db db) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            var term = ctx.Request.Query["q"].ToString();
            if (string.IsNullOrWhiteSpace(term) || term.Length < 2) return Results.Json(Array.Empty<object>());

            // Assignments in search obey the same reporting-tree visibility as the
            // rest of the app, so search can never surface work a person cannot open.
            var sa = Scope.Assignment(u, "a");
            var p = new DynamicParameters();
            p.Add("q", $"%{term}%");
            p.Add("people", sa.People);
            p.Add("uid", sa.UserId);

            var results = await db.Q($"""
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
                  FROM assignments a
                 WHERE a.deleted_at IS NULL AND ({sa.Sql}) AND (a.assignment_no ILIKE @q OR a.title ILIKE @q)
                UNION ALL
                SELECT 'user', u.id, u.employee_code, u.name, u.email
                  FROM users u WHERE u.name ILIKE @q OR u.email ILIKE @q OR u.employee_code ILIKE @q
                 LIMIT 25
                """, p);
            return Results.Json(results);
        });

        /* ---------------------------------------------------- nav counters */
        app.MapGet("/api/nav-counts", async (HttpContext ctx, Db db) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            // The sidebar task badge counts only assignments this user can actually
            // see, so it matches the Assignments list under the reporting hierarchy.
            var sa = Scope.Assignment(u, "a");
            var p = new DynamicParameters();
            p.Add("uid", u.Id);
            p.Add("people", sa.People);
            var row = await db.One($"""
                SELECT
                  (SELECT COUNT(*) FROM assignments a
                    WHERE a.deleted_at IS NULL AND a.status <> 'Completed' AND ({sa.Sql})) AS tasks,
                  (SELECT COUNT(*) FROM opportunities WHERE deleted_at IS NULL AND is_converted::integer = 0
                     AND stage IN ('Lead','Qualified','Pitched','Term Sheet','Mandated')) AS opps,
                  (SELECT COUNT(*) FROM accounts WHERE deleted_at IS NULL AND status = 'Active') AS accounts,
                  (SELECT COUNT(*) FROM work_approvals WHERE status = 'Pending') AS wapprovals,
                  (SELECT COUNT(*) FROM institutions WHERE status = 'Active') AS clients,
                  (SELECT COUNT(*) FROM research_reports WHERE status = 'Draft') AS reports_draft,
                  (SELECT COUNT(*) FROM client_visits WHERE visit_date = CURRENT_DATE) AS visits_today,
                  (SELECT COUNT(*) FROM notifications WHERE user_id = @uid AND is_read::integer = 0 AND is_deleted::integer = 0) AS notifications
                """, p);
            return Results.Json((object)row!);
        });
    }
}
