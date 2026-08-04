/* =====================================================================
   Meetings and their participants. The prototype schedules meetings from
   the internal workspace (and deal meetings from banking); this exposes
   the `meetings` / `meeting_participants` tables the schema already has.

   There is no dedicated `meetings.*` permission in the seed, so read is
   gated on `assignments.view` and scheduling on `assignments.create`,
   matching the workspace the screens live in.
   ===================================================================== */
using System.Text.Json;
using AshikaWdm.Infrastructure;
using Dapper;

namespace AshikaWdm.Endpoints;

using B = Dictionary<string, JsonElement>;

public static class MeetingEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/api/meetings", async (HttpContext ctx, Db db) =>
        {
            ((CurrentUser)ctx.Items["user"]!).Require("assignments.view");

            var where = new List<string> { "1=1" };
            var p = new DynamicParameters();
            var qs = ctx.Request.Query;
            if (!string.IsNullOrEmpty(qs["on"]))
            {
                where.Add("m.meeting_date = CAST(@on AS date)");
                p.Add("on", (string)qs["on"]!);
            }
            if (!string.IsNullOrEmpty(qs["from"]))
            {
                where.Add("m.meeting_date >= CAST(@from AS date)");
                p.Add("from", (string)qs["from"]!);
            }
            if (!string.IsNullOrEmpty(qs["workspace"]))
            {
                where.Add("m.workspace = @workspace");
                p.Add("workspace", (string)qs["workspace"]!);
            }

            return Results.Json(await db.Q($"""
                SELECT m.id, m.workspace, m.title, m.agenda, m.minutes,
                       to_char(m.meeting_date, 'YYYY-MM-DD') AS meeting_date,
                       left(m.meeting_time::text, 5)         AS meeting_time,
                       m.duration_min, m.link, m.status,
                       cu.name AS created_by_name,
                       (SELECT STRING_AGG(u.name, ', ' ORDER BY u.name)
                          FROM meeting_participants mp JOIN users u ON u.id = mp.user_id
                         WHERE mp.meeting_id = m.id) AS participants,
                       (SELECT COUNT(*) FROM meeting_participants mp
                         WHERE mp.meeting_id = m.id) AS participant_count,
                       (SELECT COUNT(*) FROM meeting_participants mp
                         WHERE mp.meeting_id = m.id AND mp.attended::integer = 1) AS attended_count
                  FROM meetings m
                  JOIN users cu ON cu.id = m.created_by
                 WHERE {string.Join(" AND ", where)}
                 ORDER BY m.meeting_date DESC, m.meeting_time
                """, p));
        });

        app.MapPost("/api/meetings", async (HttpContext ctx, Db db, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("assignments.create");

            var title = b.Str("title");
            var date = b.Str("meeting_date");
            var time = b.Str("meeting_time");
            var participants = b.IntArray("participants");

            var id = await db.Tx(async (conn, tx) =>
            {
                var mid = await conn.ExecuteScalarAsync<int>("""
                    INSERT INTO meetings
                      (workspace, title, entity_type, entity_id, meeting_date, meeting_time,
                       duration_min, link, agenda, created_by, status)
                    VALUES (@workspace, @title, 'none', NULL, CAST(@date AS date), CAST(@time AS time),
                            @dur, @link, @agenda, @me, 'Scheduled')
                    RETURNING id
                    """, new
                {
                    workspace = b.Choice("workspace", ["banking", "institutional", "internal"], "internal"),
                    title,
                    date,
                    time,
                    dur = b.OptInt("duration_min") ?? 30,
                    link = b.OptStr("link"),
                    agenda = b.OptStr("agenda"),
                    me = u.Id
                }, tx);

                foreach (var uid in participants.Distinct())
                    await conn.ExecuteAsync(
                        "INSERT INTO meeting_participants (meeting_id, user_id) VALUES (@mid, @uid)",
                        new { mid, uid }, tx);
                return mid;
            });

            await Audit.LogActivity(db, ctx, "meeting", id, "created", $"Meeting scheduled: {title}");
            foreach (var uid in participants.Distinct())
                await Audit.Notify(db, uid, "Meeting", "You are invited",
                    $"{title} on {date} at {time}.", "meeting", id);

            return Results.Json(new { id }, statusCode: 201);
        });

        app.MapPatch("/api/meetings/{id:int}", async (HttpContext ctx, Db db, int id, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("assignments.create");

            var status = b.Choice("status", ["Scheduled", "Completed", "Cancelled"], "Scheduled");
            var title = await db.Scalar<string>("SELECT title FROM meetings WHERE id = @id", new { id });
            await db.Exec("UPDATE meetings SET status = @status, minutes = @minutes WHERE id = @id",
                new { status, minutes = b.OptStr("minutes"), id });
            await Audit.LogActivity(db, ctx, "meeting", id, "updated", $"Meeting {status.ToLowerInvariant()}");
            if (status is "Cancelled" or "Completed")
            {
                var parts = await db.Q("SELECT user_id FROM meeting_participants WHERE meeting_id = @id", new { id });
                foreach (var pt in parts)
                    if ((int)pt.user_id != u.Id)
                        await Audit.Notify(db, (int)pt.user_id, "Meeting", $"Meeting {status.ToLowerInvariant()}",
                            $"\"{title}\" was {status.ToLowerInvariant()}.", "meeting", id, u.Id);
            }
            return Results.Json(new { ok = true });
        });

        app.MapDelete("/api/meetings/{id:int}", async (HttpContext ctx, Db db, int id) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("assignments.create");
            var title = await db.Scalar<string>("SELECT title FROM meetings WHERE id = @id", new { id });
            var parts = (await db.Q("SELECT user_id FROM meeting_participants WHERE meeting_id = @id", new { id })).ToList();
            var n = await db.Exec("DELETE FROM meetings WHERE id = @id", new { id });
            if (n == 0) throw AppException.NotFound();
            await Audit.LogActivity(db, ctx, "meeting", id, "deleted", "Meeting removed");
            foreach (var pt in parts)
                if ((int)pt.user_id != u.Id)
                    await Audit.Notify(db, (int)pt.user_id, "Meeting", "Meeting removed",
                        $"\"{title}\" was cancelled and removed.", "meeting", null, u.Id);
            return Results.Json(new { ok = true });
        });
    }
}
