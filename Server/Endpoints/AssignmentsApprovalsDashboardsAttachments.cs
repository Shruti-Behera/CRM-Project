/* =====================================================================
   Internal work: assignments with the 24-hour daily cap on time logs,
   work approvals decided once by the named approver, the three dashboard
   payloads, and attachments. Ported from routes/assignments.js,
   routes/workApprovals.js, routes/dashboards.js and routes/attachments.js.
   ===================================================================== */
using System.Text.Json;
using AshikaWdm.Infrastructure;
using Dapper;

namespace AshikaWdm.Endpoints;

using B = Dictionary<string, JsonElement>;

public static class AssignmentEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/api/assignments", async (HttpContext ctx, Db db) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("assignments.view");
            var s = Scope.Assignment(u);
            var where = new List<string> { s.Sql, "a.deleted_at IS NULL" };
            var p = new DynamicParameters();
            p.Add("people", s.People); p.Add("deptId", s.DepartmentId); p.Add("uid", s.UserId);

            var qs = ctx.Request.Query;
            if (!string.IsNullOrEmpty(qs["status"])) { where.Add("a.status = @st"); p.Add("st", (string)qs["status"]!); }
            if (!string.IsNullOrEmpty(qs["assignee"])) { where.Add("a.assigned_to = @to"); p.Add("to", int.Parse(qs["assignee"]!)); }
            if (!string.IsNullOrEmpty(qs["q"]))
            {
                where.Add("(a.title ILIKE @q OR a.assignment_no ILIKE @q)");
                p.Add("q", $"%{qs["q"]}%");
            }

            return Results.Json(await db.Q($"""
                SELECT a.id, a.assignment_no, a.title, a.status, a.priority, a.progress_pct,
                       a.start_date, a.due_date, a.sla_days, a.estimated_hours, a.actual_hours,
                       d.name AS department, c.name AS category, p.name AS project,
                       ub.name AS assigned_by_name, ut.name AS assigned_to_name,
                       (a.status <> 'Completed' AND a.due_date < CURRENT_DATE) AS is_overdue,
                       (SELECT STRING_AGG(t.name, ',') FROM assignment_tags at
                          JOIN tags t ON t.id = at.tag_id
                         WHERE at.assignment_id = a.id) AS tags
                  FROM assignments a
                  JOIN users ub ON ub.id = a.assigned_by
                  JOIN users ut ON ut.id = a.assigned_to
                  LEFT JOIN departments d ON d.id = a.department_id
                  LEFT JOIN categories c ON c.id = a.category_id
                  LEFT JOIN projects p ON p.id = a.project_id
                 WHERE {string.Join(" AND ", where)} ORDER BY a.due_date
                """, p));
        });

        app.MapGet("/api/assignments/my-day", async (HttpContext ctx, Db db) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("assignments.view");
            var uid = u.Id;
            const string mine = """
                (a.assigned_to = @uid OR EXISTS
                  (SELECT 1 FROM assignment_watchers w
                    WHERE w.assignment_id = a.id AND w.user_id = @uid))
                """;
            const string baseSql = $"""
                SELECT a.id, a.assignment_no, a.title, a.due_date, a.priority, a.status,
                       a.progress_pct, d.name AS department
                  FROM assignments a LEFT JOIN departments d ON d.id = a.department_id
                 WHERE a.deleted_at IS NULL AND a.status <> 'Completed' AND {mine}
                """;

            return Results.Json(new
            {
                overdue = await db.Q(baseSql + " AND a.due_date < CURRENT_DATE ORDER BY a.due_date", new { uid }),
                today = await db.Q(baseSql + " AND a.due_date = CURRENT_DATE", new { uid }),
                upcoming = await db.Q(baseSql + """
                     AND a.due_date BETWEEN CURRENT_DATE + 1 AND CURRENT_DATE + 3
                    """, new { uid }),
                approvals = await db.Q("""
                    SELECT w.id, w.approval_no, w.title, w.amount, wt.name AS work_type, u.name AS raised_by
                      FROM work_approvals w JOIN work_types wt ON wt.id = w.work_type_id
                      JOIN users u ON u.id = w.raised_by
                     WHERE w.status = 'Pending' AND w.approver_id = @uid
                    """, new { uid }),
                hours_today = await db.Scalar<decimal>("""
                    SELECT COALESCE(SUM(hours),0) FROM time_logs
                     WHERE user_id = @uid AND log_date = CURRENT_DATE
                    """, new { uid })
            });
        });

        app.MapGet("/api/assignments/reports/workload", async (HttpContext ctx, Db db) =>
        {
            ((CurrentUser)ctx.Items["user"]!).Require("assignments.view");
            return Results.Json(await db.Q("SELECT * FROM v_workload ORDER BY open_hours DESC"));
        });

        app.MapGet("/api/assignments/reports/sla", async (HttpContext ctx, Db db) =>
        {
            ((CurrentUser)ctx.Items["user"]!).Require("assignments.view");
            return Results.Json(await db.Q("SELECT * FROM v_sla_breaches ORDER BY days_over_sla DESC"));
        });

        app.MapGet("/api/assignments/{id:int}", async (HttpContext ctx, Db db, int id) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("assignments.view");
            var s = Scope.Assignment(u);
            var row = await db.One($"""
                SELECT a.*, ub.name AS assigned_by_name, ut.name AS assigned_to_name,
                       d.name AS department, c.name AS category, p.name AS project
                  FROM assignments a
                  JOIN users ub ON ub.id = a.assigned_by
                  JOIN users ut ON ut.id = a.assigned_to
                  LEFT JOIN departments d ON d.id = a.department_id
                  LEFT JOIN categories c ON c.id = a.category_id
                  LEFT JOIN projects p ON p.id = a.project_id
                 WHERE {s.Sql} AND a.id = @id AND a.deleted_at IS NULL
                """, new { people = s.People, deptId = s.DepartmentId, uid = s.UserId, id })
                ?? throw AppException.NotFound("No such assignment, or it is outside what you can see");

            row.subtasks = await db.Q("""
                SELECT s.*, u.name AS owner FROM assignment_subtasks s
                  LEFT JOIN users u ON u.id = s.owner_id
                 WHERE s.assignment_id = @id ORDER BY s.sort_order
                """, new { id });
            row.notes = await db.Q("""
                SELECT n.*, u.name AS author FROM assignment_notes n JOIN users u ON u.id = n.user_id
                 WHERE n.assignment_id = @id ORDER BY n.note_at DESC
                """, new { id });
            row.time_logs = await db.Q("""
                SELECT t.*, u.name AS who FROM time_logs t JOIN users u ON u.id = t.user_id
                 WHERE t.assignment_id = @id ORDER BY t.log_date DESC
                """, new { id });
            row.watchers = await db.Q("""
                SELECT u.id, u.name, w.is_support FROM assignment_watchers w
                  JOIN users u ON u.id = w.user_id
                 WHERE w.assignment_id = @id
                """, new { id });
            return Results.Json((object)row);
        });

        app.MapPost("/api/assignments", async (HttpContext ctx, Db db, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("assignments.create");
            var startDate = b.Str("start_date");
            var dueDate = b.Str("due_date");
            if (string.CompareOrdinal(dueDate, startDate) < 0)
                throw AppException.BadRequest("The due date is before the start date");
            var assignedTo = b.Int("assigned_to");

            var id = await db.Tx(async (conn, tx) =>
            {
                var no = await Db.NextNo(conn, tx, "assignments", "assignment_no", "ASG", fyPrefix: true);
                var aid = await conn.ExecuteScalarAsync<int>("""
                    INSERT INTO assignments
                      (assignment_no, title, description, department_id, category_id, project_id,
                       assigned_by, assigned_to, start_date, due_date, sla_days, status, priority,
                       estimated_hours, recurrence, blocked_by_id, linked_type, linked_id)
                    VALUES (@no, @title, @description, @dept, @category, @project, @me, @assignedTo,
                            CAST(@start AS date), CAST(@due AS date), @sla, @status, @priority,
                            @estimated, @recurrence, @blockedBy, @linkedType, @linkedId)
                    RETURNING id
                    """, new
                {
                    no, title = b.Str("title"), description = b.OptStr("description"),
                    dept = b.OptInt("department_id"), category = b.OptInt("category_id"),
                    project = b.OptInt("project_id"), me = u.Id, assignedTo,
                    start = startDate, due = dueDate, sla = b.OptInt("sla_days") ?? 5,
                    status = b.Choice("status",
                        ["Pending", "In Progress", "Under Review", "Completed", "On Hold"], "Pending"),
                    priority = b.Choice("priority", ["Low", "Medium", "High", "Critical"], "Medium"),
                    estimated = b.Dec("estimated_hours"),
                    recurrence = b.Choice("recurrence", ["None", "Weekly", "Monthly", "Quarterly"], "None"),
                    blockedBy = b.OptInt("blocked_by_id"),
                    linkedType = b.Choice("linked_type", ["none", "account", "opportunity", "mandate"], "none"),
                    linkedId = b.OptInt("linked_id")
                }, tx);

                foreach (var t in b.IntArray("tags"))
                    await conn.ExecuteAsync(
                        "INSERT INTO assignment_tags (assignment_id, tag_id) VALUES (@aid, @t)",
                        new { aid, t }, tx);
                foreach (var w in b.IntArray("watchers"))
                    await conn.ExecuteAsync(
                        "INSERT INTO assignment_watchers (assignment_id, user_id) VALUES (@aid, @w)",
                        new { aid, w }, tx);

                var subtasks = b.ObjArray("subtasks");
                for (var i = 0; i < subtasks.Count; i++)
                    await conn.ExecuteAsync("""
                        INSERT INTO assignment_subtasks (assignment_id, title, owner_id, sort_order)
                        VALUES (@aid, @title, @owner, @order)
                        """, new { aid, title = subtasks[i].Str("title"),
                                   owner = subtasks[i].OptInt("owner_id"), order = i + 1 }, tx);

                string[] checklist = ["Requirement received", "Discussion completed", "Work started",
                                      "Under Review", "Approved", "Completed"];
                for (var i = 0; i < checklist.Length; i++)
                    await conn.ExecuteAsync("""
                        INSERT INTO assignment_checklist (assignment_id, item_text, sort_order)
                        VALUES (@aid, @item, @order)
                        """, new { aid, item = checklist[i], order = i + 1 }, tx);
                return aid;
            });

            await Audit.LogActivity(db, ctx, "assignment", id, "created", "Assignment created");
            await Audit.Notify(db, assignedTo, "New Assignment", "New assignment",
                $"{b.Str("title")} is due {dueDate}.", "assignment", id);
            return Results.Json(new { id }, statusCode: 201);
        });

        app.MapPost("/api/assignments/{id:int}/time", async (HttpContext ctx, Db db, int id, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("time.log");
            var logDate = b.Str("log_date");
            var hours = b.Dec("hours");
            if (hours <= 0 || hours > 24)
                throw AppException.BadRequest("Hours must be between 0 and 24");
            var uid = b.OptInt("user_id") ?? u.Id;

            var total = await db.Scalar<decimal>("""
                SELECT COALESCE(SUM(hours),0) FROM time_logs
                 WHERE user_id = @uid AND log_date = CAST(@logDate AS date)
                """, new { uid, logDate });
            if (total + hours > 24)
                throw AppException.BadRequest(
                    $"That would take this person past 24 hours logged on {logDate}");

            await db.Exec("""
                INSERT INTO time_logs (assignment_id, user_id, log_date, hours, narration)
                VALUES (@id, @uid, CAST(@logDate AS date), @hours, @narration)
                """, new { id, uid, logDate, hours, narration = b.OptStr("narration") });

            /* the trigger has already updated it */
            var actual = await db.Scalar<decimal>(
                "SELECT actual_hours FROM assignments WHERE id = @id", new { id });
            return Results.Json(new { actual_hours = actual }, statusCode: 201);
        });
    }
}

public static class WorkApprovalEndpoints
{
    private static (string Sql, object P) ScopeSql(CurrentUser u) => u.ScopeKind switch
    {
        "all" => ("1=1", new { }),
        "team" => ("""
            (w.department_id = @dept OR w.raised_by = ANY(@people) OR w.approver_id = ANY(@people))
            """, (object)new { dept = u.DepartmentId, people = u.People }),
        _ => ("(w.raised_by = @uid OR w.approver_id = @uid)", (object)new { uid = u.Id })
    };

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/work-approvals", async (HttpContext ctx, Db db) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("workapproval.view");
            var (scopeSql, scopeP) = ScopeSql(u);
            var where = new List<string> { scopeSql };
            var p = new DynamicParameters(scopeP);

            if (!string.IsNullOrEmpty(ctx.Request.Query["status"]))
            {
                where.Add("w.status = @st");
                p.Add("st", (string)ctx.Request.Query["status"]!);
            }

            return Results.Json(await db.Q($"""
                SELECT w.*, wt.name AS work_type, d.name AS department,
                       ur.name AS raised_by_name, ua.name AS approver_name,
                       (SELECT COUNT(*) FROM attachments a
                         WHERE a.entity_type = 'work_approval' AND a.entity_id = w.id) AS attachments
                  FROM work_approvals w
                  JOIN work_types wt ON wt.id = w.work_type_id
                  JOIN users ur ON ur.id = w.raised_by
                  JOIN users ua ON ua.id = w.approver_id
                  LEFT JOIN departments d ON d.id = w.department_id
                 WHERE {string.Join(" AND ", where)}
                 ORDER BY array_position(
                            ARRAY['Pending','On hold','Draft','Approved','Rejected','Withdrawn'], w.status),
                          w.needed_by
                """, p));
        });

        app.MapPost("/api/work-approvals", async (HttpContext ctx, Db db, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("workapproval.create");
            var status = b.Choice("status", ["Draft", "Pending"], "Pending");
            var approverId = b.Int("approver_id");
            var amount = b.Dec("amount");
            var title = b.Str("title");

            var id = await db.Tx(async (conn, tx) =>
            {
                var no = await Db.NextNo(conn, tx, "work_approvals", "approval_no", "APR", fyPrefix: true);
                return await conn.ExecuteScalarAsync<int>("""
                    INSERT INTO work_approvals
                      (approval_no, title, work_type_id, department_id, amount, vendor, priority,
                       raised_by, raised_on, approver_id, needed_by, status, details)
                    VALUES (@no, @title, @workType, @dept, @amount, @vendor, @priority,
                            @me, CURRENT_DATE, @approverId, CAST(@neededBy AS date), @status, @details)
                    RETURNING id
                    """, new
                {
                    no, title, workType = b.Int("work_type_id"), dept = b.OptInt("department_id"),
                    amount, vendor = b.OptStr("vendor"),
                    priority = b.Choice("priority", ["Routine", "Normal", "Urgent"], "Normal"),
                    me = u.Id, approverId, neededBy = b.OptStr("needed_by"),
                    status, details = b.OptStr("details")
                }, tx);
            });

            await Audit.LogActivity(db, ctx, "work_approval", id, "raised", title);
            if (status == "Pending")
                await Audit.Notify(db, approverId, "Approval Pending", "Approval needed",
                    $"{title}{(amount > 0 ? $" — {amount}" : "")} needs your approval.", "work_approval", id);
            return Results.Json(new { id }, statusCode: 201);
        });

        /* PATCH /api/work-approvals/{id}/decide — only the named approver, and only once */
        app.MapPatch("/api/work-approvals/{id:int}/decide", async (HttpContext ctx, Db db, int id, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            var status = b.Choice("status", ["Approved", "Rejected"], "");
            var remarks = b.OptStr("remarks");

            var row = await db.One("SELECT * FROM work_approvals WHERE id = @id", new { id })
                ?? throw AppException.NotFound();
            if ((int)row.approver_id != u.Id && !u.Can("workapproval.approve"))
                throw AppException.Forbidden("Only the named approver can decide this");
            if ((string)row.status != "Pending")
                throw AppException.Conflict("This has already been decided");

            await db.Exec("""
                UPDATE work_approvals SET status = @status, decided_by = @me,
                       decided_on = CURRENT_DATE, remarks = @remarks
                 WHERE id = @id
                """, new
            {
                status, me = u.Id,
                remarks = remarks ?? (status == "Approved" ? "Approved." : "Not approved."), id
            });

            await Audit.LogActivity(db, ctx, "work_approval", id, status.ToLowerInvariant(),
                $"{status}{(remarks is not null ? $" — {remarks}" : "")}");
            await Audit.Notify(db, (int)row.raised_by, "Approval Decided",
                $"Approval {status.ToLowerInvariant()}",
                $"{row.approval_no} {row.title} was {status.ToLowerInvariant()}.", "work_approval", id);
            return Results.Json(new { ok = true });
        });

        app.MapPost("/api/work-approvals/{id:int}/notes", async (HttpContext ctx, Db db, int id, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("workapproval.view");
            await db.Exec("""
                INSERT INTO work_approval_notes (approval_id, user_id, note_at, comment)
                VALUES (@id, @me, NOW(), @comment)
                """, new { id, me = u.Id, comment = b.Str("comment") });
            return Results.Json(new { ok = true }, statusCode: 201);
        });
    }
}

public static class DashboardEndpoints
{
    public static void Map(WebApplication app)
    {
        /* Everything the banking dashboard draws, in one round trip. */
        app.MapGet("/api/dashboards/banking", async (HttpContext ctx, Db db) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("opportunities.view");
            var s = Scope.Banking(u);
            var p = new { people = s.People, divId = s.DivisionId, uid = s.UserId };
            const string live = """
                o.deleted_at IS NULL AND o.is_converted = 0
                AND o.stage IN ('Lead','Qualified','Pitched','Term Sheet','Mandated')
                """;

            var kpi = await db.One($"""
                SELECT COUNT(*) AS live_opps, COALESCE(SUM(o.txn_size_cr),0) AS pipeline_cr,
                       COALESCE(SUM(o.expected_fee_l),0) AS gross_fee_l,
                       COALESCE(SUM(o.weighted_fee_l),0) AS weighted_fee_l
                  FROM opportunities o WHERE {live} AND {s.Sql}
                """, p);
            var mandates = await db.One("""
                SELECT COUNT(*) AS total,
                       COUNT(*) FILTER (WHERE status = 'Active') AS active,
                       COALESCE(SUM(estimated_fee_l),0) AS mandated_l,
                       COALESCE(SUM(realised_fee_l),0)  AS realised_l
                  FROM mandates WHERE deleted_at IS NULL
                """);

            var kpiOut = new Dictionary<string, object?>();
            foreach (var kv in (IDictionary<string, object>)kpi!) kpiOut[kv.Key] = kv.Value;
            foreach (var kv in (IDictionary<string, object>)mandates!) kpiOut[kv.Key] = kv.Value;

            return Results.Json(new
            {
                kpi = kpiOut,
                funnel = await db.Q("SELECT * FROM v_pipeline_summary"),
                by_division = await db.Q($"""
                    SELECT dv.name AS division, COUNT(*) AS deals,
                           COALESCE(SUM(o.expected_fee_l),0) AS gross_fee_l,
                           COALESCE(SUM(o.weighted_fee_l),0) AS weighted_fee_l
                      FROM opportunities o LEFT JOIN divisions dv ON dv.id = o.division_id
                     WHERE {live} AND {s.Sql} GROUP BY dv.name
                    """, p),
                by_deal_type = await db.Q($"""
                    SELECT dt.name AS deal_type, COALESCE(SUM(o.expected_fee_l),0) AS gross_fee_l,
                           COALESCE(SUM(o.weighted_fee_l),0) AS weighted_fee_l
                      FROM opportunities o JOIN deal_types dt ON dt.id = o.deal_type_id
                     WHERE {live} AND {s.Sql} GROUP BY dt.name ORDER BY gross_fee_l DESC
                    """, p),
                mandate_fees = await db.Q("SELECT * FROM v_mandate_fees ORDER BY signed_on DESC LIMIT 10"),
                next_actions = await db.Q($"""
                    SELECT o.opportunity_no, o.next_action, o.next_action_due, a.name AS account
                      FROM opportunities o JOIN accounts a ON a.id = o.account_id
                     WHERE {live} AND {s.Sql} AND o.next_action_due IS NOT NULL
                     ORDER BY o.next_action_due LIMIT 6
                    """, p)
            });
        });

        app.MapGet("/api/dashboards/institutional", async (HttpContext ctx, Db db) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("institutional.view");
            var s = Scope.Institution(u);
            var p = new { people = s.People, uid = s.UserId };

            return Results.Json(new
            {
                kpi = await db.One($"""
                    SELECT (SELECT COUNT(*) FROM institutions i WHERE {s.Sql}) AS clients,
                           (SELECT COUNT(*) FROM client_visits v
                              JOIN institutions i ON i.id = v.institution_id
                             WHERE {s.Sql}
                               AND v.visit_date >= CURRENT_DATE - 7) AS visits_week,
                           (SELECT COALESCE(SUM(b.brokerage),0) FROM brokerage b
                              JOIN institutions i ON i.id = b.institution_id
                             WHERE {s.Sql}
                               AND b.period_month = to_char(CURRENT_DATE,'YYYY-MM')) AS brokerage_mtd,
                           (SELECT COUNT(*) FROM research_reports WHERE status = 'Published') AS reports
                    """, p),
                monthly = await db.Q($"""
                    SELECT b.period_month, b.segment, SUM(b.brokerage) AS brokerage,
                           SUM(b.turnover) AS turnover
                      FROM brokerage b JOIN institutions i ON i.id = b.institution_id
                     WHERE {s.Sql}
                       AND b.period_month >= to_char(CURRENT_DATE - INTERVAL '5 months','YYYY-MM')
                     GROUP BY b.period_month, b.segment ORDER BY b.period_month
                    """, p),
                top_clients = await db.Q($"""
                    SELECT i.name, COALESCE(SUM(b.brokerage),0) AS brokerage
                      FROM institutions i LEFT JOIN brokerage b ON b.institution_id = i.id
                     WHERE {s.Sql} GROUP BY i.id, i.name
                    HAVING COALESCE(SUM(b.brokerage),0) > 0
                     ORDER BY brokerage DESC LIMIT 7
                    """, p),
                cold = await db.Q("""
                    SELECT * FROM v_institution_summary
                     WHERE days_since_met IS NULL OR days_since_met > 30
                     ORDER BY days_since_met DESC NULLS LAST LIMIT 8
                    """)
            });
        });

        app.MapGet("/api/dashboards/internal", async (HttpContext ctx, Db db) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("assignments.view");
            var s = Scope.Assignment(u);
            var p = new { people = s.People, deptId = s.DepartmentId, uid = s.UserId };

            return Results.Json(new
            {
                kpi = await db.One($"""
                    SELECT COUNT(*) AS total,
                           COUNT(*) FILTER (WHERE a.status = 'Completed') AS completed,
                           COUNT(*) FILTER (WHERE a.status = 'Pending') AS pending,
                           COUNT(*) FILTER (WHERE a.status IN ('In Progress','Under Review')) AS in_flight,
                           COUNT(*) FILTER (WHERE a.status <> 'Completed'
                                              AND a.due_date < CURRENT_DATE) AS overdue
                      FROM assignments a WHERE a.deleted_at IS NULL AND {s.Sql}
                    """, p),
                by_status = await db.Q($"""
                    SELECT d.name AS department, a.status, COUNT(*) AS n
                      FROM assignments a LEFT JOIN departments d ON d.id = a.department_id
                     WHERE a.deleted_at IS NULL AND {s.Sql} GROUP BY d.name, a.status
                    """, p),
                workload = await db.Q("SELECT * FROM v_workload ORDER BY open_hours DESC LIMIT 10"),
                performance = await db.Q(
                    "SELECT * FROM v_employee_performance ORDER BY efficiency_pct DESC LIMIT 10")
            });
        });
    }
}

public static class AttachmentEndpoints
{
    private static readonly string[] Entities =
        ["account", "opportunity", "mandate", "assignment", "institution",
         "research_report", "work_approval", "visit"];

    private static readonly HashSet<string> Allowed =
    [
        "application/pdf", "image/png", "image/jpeg", "image/gif", "text/csv", "text/plain",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/zip", "audio/webm", "audio/mpeg", "audio/mp4", "audio/ogg"
    ];

    private static void CheckEntity(string entity)
    {
        if (!Entities.Contains(entity)) throw AppException.BadRequest("Unknown record type");
    }

    public static void Map(WebApplication app)
    {
        var uploadRoot = app.Configuration["Uploads:Dir"] ?? "storage/uploads";
        var maxBytes = (long)(int.TryParse(app.Configuration["Uploads:MaxMb"], out var mb) ? mb : 15)
                       * 1024 * 1024;

        app.MapGet("/api/attachments/{entity}/{id:long}", async (HttpContext ctx, Db db,
            string entity, long id) =>
        {
            CheckEntity(entity);
            return Results.Json(await db.Q("""
                SELECT a.id, a.kind, a.original_name, a.url, a.mime_type, a.size_bytes,
                       a.duration_secs, a.created_at, u.name AS uploaded_by
                  FROM attachments a JOIN users u ON u.id = a.uploaded_by
                 WHERE a.entity_type = @entity AND a.entity_id = @id ORDER BY a.created_at DESC
                """, new { entity, id }));
        });

        app.MapPost("/api/attachments/{entity}/{id:long}", async (HttpContext ctx, Db db,
            string entity, long id) =>
        {
            CheckEntity(entity);
            var u = (CurrentUser)ctx.Items["user"]!;
            var form = await ctx.Request.ReadFormAsync();
            var saved = new List<object>();

            foreach (var f in form.Files)
            {
                if (f.Length == 0) continue;
                if (f.Length > maxBytes)
                    throw AppException.BadRequest($"{f.FileName} is larger than the {maxBytes / 1024 / 1024} MB limit");
                if (!Allowed.Contains(f.ContentType))
                    throw AppException.BadRequest($"{f.ContentType} is not an accepted file type");

                /* Files are written under a generated name. The original is kept
                   in the database only — a filename from a browser is not to be
                   trusted on disk. */
                var dir = Path.Combine(uploadRoot, entity, id.ToString());
                Directory.CreateDirectory(dir);
                var ext = Path.GetExtension(f.FileName);
                if (ext.Length > 10) ext = ext[..10];
                var stored = Path.Combine(dir, $"{Guid.NewGuid()}{ext}");
                await using (var stream = File.Create(stored))
                    await f.CopyToAsync(stream);

                var aid = await db.Scalar<long>("""
                    INSERT INTO attachments
                      (entity_type, entity_id, kind, original_name, stored_path, mime_type,
                       size_bytes, duration_secs, uploaded_by)
                    VALUES (@entity, @id, @kind, @name, @path, @mime, @size, @duration, @me)
                    RETURNING id
                    """, new
                {
                    entity, id,
                    kind = f.ContentType.StartsWith("audio/") ? "voice" : "file",
                    name = f.FileName, path = stored, mime = f.ContentType, size = f.Length,
                    duration = form.TryGetValue("duration_secs", out var d)
                               && int.TryParse(d, out var secs) ? (int?)secs : null,
                    me = u.Id
                });
                saved.Add(new { id = aid, name = f.FileName, size = f.Length });
            }

            await Audit.LogActivity(db, ctx, entity, id, "attachment", $"{saved.Count} file(s) added");
            return Results.Json(saved, statusCode: 201);
        });

        /* A link costs nothing to store, which is the right answer for a 40 MB data pack. */
        app.MapPost("/api/attachments/{entity}/{id:long}/link", async (HttpContext ctx, Db db,
            string entity, long id, B b) =>
        {
            CheckEntity(entity);
            var u = (CurrentUser)ctx.Items["user"]!;
            var url = b.Str("url");
            var aid = await db.Scalar<long>("""
                INSERT INTO attachments (entity_type, entity_id, kind, original_name, url, uploaded_by)
                VALUES (@entity, @id, 'link', @name, @url, @me)
                RETURNING id
                """, new { entity, id, name = b.OptStr("label") ?? url, url, me = u.Id });
            return Results.Json(new { id = aid }, statusCode: 201);
        });

        app.MapGet("/api/attachments/download/{id:long}", async (Db db, long id) =>
        {
            var a = await db.One("SELECT * FROM attachments WHERE id = @id", new { id })
                ?? throw AppException.NotFound();
            if ((string)a.kind == "link") return Results.Redirect((string)a.url);
            var path = (string)a.stored_path;
            if (!File.Exists(path)) throw AppException.NotFound("The file is no longer on disk");
            return Results.File(Path.GetFullPath(path),
                (string?)a.mime_type ?? "application/octet-stream",
                fileDownloadName: (string)a.original_name);
        });

        app.MapDelete("/api/attachments/{id:long}", async (HttpContext ctx, Db db, long id) =>
        {
            var a = await db.One("SELECT * FROM attachments WHERE id = @id", new { id })
                ?? throw AppException.NotFound();
            await db.Exec("DELETE FROM attachments WHERE id = @id", new { id });
            var path = (string?)a.stored_path;
            if (path is not null)
                try { File.Delete(path); } catch { /* gone from disk already is fine */ }
            await Audit.LogActivity(db, ctx, (string)a.entity_type, (long)a.entity_id,
                "attachment_removed", (string)a.original_name);
            return Results.Json(new { ok = true });
        });
    }
}
