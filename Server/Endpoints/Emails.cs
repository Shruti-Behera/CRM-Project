/* =====================================================================
   Email correspondence log. The prototype records mail sent from (and
   received against) assignments, opportunities and mandates, threaded by
   the [OPP-2026-0001] style token in the subject. This exposes the
   existing `emails` table.

   There is no real SMTP/IMAP here (see docs/PORTING.md); "Send" records
   the message with status 'Sent'. Gated on assignments.view like the rest
   of the internal Schedule section.
   ===================================================================== */
using System.Text.Json;
using System.Text.RegularExpressions;
using AshikaWdm.Infrastructure;
using Dapper;

namespace AshikaWdm.Endpoints;

using B = Dictionary<string, JsonElement>;

public static class EmailEndpoints
{
    /* Thread on the [DOC-No] token when present, else the trimmed subject. */
    private static string ThreadKey(string? subject)
    {
        var s = (subject ?? "").Trim();
        var m = Regex.Match(s, @"\[([A-Za-z]+-[0-9\-]+)\]");
        if (m.Success) return m.Groups[1].Value;
        if (s.Length == 0) return "(no subject)";
        return s.Length > 80 ? s[..80] : s;
    }

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/emails", async (HttpContext ctx, Db db) =>
        {
            ((CurrentUser)ctx.Items["user"]!).Require("assignments.view");

            var where = new List<string> { "1=1" };
            var p = new DynamicParameters();
            var qs = ctx.Request.Query;
            if (!string.IsNullOrEmpty(qs["direction"])) { where.Add("e.direction = @dir"); p.Add("dir", (string)qs["direction"]!); }
            if (!string.IsNullOrEmpty(qs["status"])) { where.Add("e.status = @status"); p.Add("status", (string)qs["status"]!); }
            if (!string.IsNullOrEmpty(qs["q"]))
            {
                where.Add("(e.subject ILIKE @q OR e.from_address ILIKE @q OR e.to_addresses ILIKE @q)");
                p.Add("q", $"%{qs["q"]}%");
            }

            return Results.Json(await db.Q($"""
                SELECT e.id,
                       to_char(COALESCE(e.sent_at, e.created_at), 'YYYY-MM-DD HH24:MI') AS sent_at,
                       e.direction, e.from_address, e.to_addresses, e.cc_addresses,
                       e.subject, e.body, e.thread_key, e.status, e.entity_type, e.entity_id,
                       a.assignment_no AS linked_no
                  FROM emails e
                  LEFT JOIN assignments a ON e.entity_type = 'assignment' AND a.id = e.entity_id
                 WHERE {string.Join(" AND ", where)}
                 ORDER BY COALESCE(e.sent_at, e.created_at) DESC, e.id DESC
                 LIMIT 500
                """, p));
        });

        app.MapPost("/api/emails", async (HttpContext ctx, Db db, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("assignments.create");

            var subject = b.OptStr("subject") ?? "(no subject)";
            var to = b.Str("to");
            var assignmentId = b.OptInt("assignment_id");

            var id = await db.Scalar<long>("""
                INSERT INTO emails
                  (entity_type, entity_id, thread_key, direction, from_address, to_addresses,
                   cc_addresses, subject, body, status, sent_by, sent_at)
                VALUES (@entityType, @entityId, @threadKey, 'out', @from, @to, @cc, @subject, @body,
                        'Sent', @me, NOW())
                RETURNING id
                """, new
            {
                entityType = assignmentId is null ? "none" : "assignment",
                entityId = assignmentId,
                threadKey = ThreadKey(subject),
                from = u.Email,
                to,
                cc = b.OptStr("cc"),
                subject,
                body = b.OptStr("body"),
                me = u.Id
            });

            if (assignmentId is not null)
                await Audit.LogActivity(db, ctx, "assignment", assignmentId.Value, "email_sent", $"Email sent — {subject}");
            return Results.Json(new { id }, statusCode: 201);
        });
    }
}
