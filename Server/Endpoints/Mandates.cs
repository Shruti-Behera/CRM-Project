/* =====================================================================
   Investment & Merchant Banking — Execution.
   Mandates (signed engagements), closing them out to Closed Projects, fee
   receipts, milestones and execution notes. Deal Meetings reuse the existing
   /api/meetings endpoint (workspace = banking), so there is no code here for
   them. All data is read from / written to PostgreSQL; nothing is hard-coded.
   ===================================================================== */
using System.Text.Json;
using AshikaWdm.Infrastructure;
using Dapper;

namespace AshikaWdm.Endpoints;

using B = Dictionary<string, JsonElement>;

public static class MandateEndpoints
{
    /* Visibility mirrors the rest of banking (keyed on the role's data-scope, so
       Management/Head see everything, a Manager sees their reporting line and
       division, an Executive their own). A mandate is "theirs" if they created
       it, it sits in their division, or they are on the deal team. */
    private static (string Sql, DynamicParameters P) Scope(CurrentUser u, string alias = "m")
    {
        var p = new DynamicParameters();
        p.Add("uid", u.Id);
        if (u.ScopeKind == "all") return ("1=1", p);
        p.Add("people", u.People ?? new[] { u.Id });
        p.Add("divId", u.DivisionId);
        return ($"""
            ({alias}.created_by = ANY(@people)
              OR (CAST(@divId AS int) IS NOT NULL AND {alias}.division_id = @divId)
              OR EXISTS (SELECT 1 FROM mandate_team mt
                          WHERE mt.mandate_id = {alias}.id AND mt.user_id = ANY(@people)))
            """, p);
    }

    private static readonly string[] Statuses = ["Active", "Executed", "On Hold", "Terminated"];
    private static readonly string[] DefaultMilestones =
        ["Kick-off", "Due diligence", "Documentation", "Regulatory filing",
         "Roadshow / marketing", "Closing", "Fee realisation"];

    public static void Map(WebApplication app)
    {
        /* ------------------------------------------------------------ list */
        app.MapGet("/api/mandates", async (HttpContext ctx, Db db) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("mandates.view");
            var (scopeSql, p) = Scope(u);

            var where = new List<string> { "m.deleted_at IS NULL", scopeSql };
            var qs = ctx.Request.Query;
            if (!string.IsNullOrEmpty(qs["status"])) { where.Add("m.status = @st"); p.Add("st", (string)qs["status"]!); }
            if (!string.IsNullOrEmpty(qs["q"]))
            {
                where.Add("(m.mandate_no ILIKE @q OR a.name ILIKE @q OR dt.name ILIKE @q)");
                p.Add("q", $"%{qs["q"]}%");
            }

            return Results.Json(await db.Q($"""
                SELECT m.id, m.mandate_no, a.name AS account, dt.name AS deal_type, d.name AS division,
                       m.signed_on, m.expected_end, m.closed_on, m.retainer_l, m.success_fee_pct,
                       m.estimated_fee_l, m.realised_fee_l, m.outstanding_l, m.txn_value_cr, m.status,
                       m.opportunity_id, o.opportunity_no,
                       ROUND(100.0 * m.realised_fee_l / NULLIF(m.estimated_fee_l,0)) AS realisation_pct,
                       (SELECT COUNT(*) FROM mandate_milestones mm WHERE mm.mandate_id = m.id) AS milestones,
                       (SELECT COUNT(*) FROM mandate_milestones mm WHERE mm.mandate_id = m.id AND mm.is_done::integer = 1) AS milestones_done,
                       (SELECT STRING_AGG(us.name, ', ' ORDER BY mt.team_role, us.name)
                          FROM mandate_team mt JOIN users us ON us.id = mt.user_id
                         WHERE mt.mandate_id = m.id) AS team
                  FROM mandates m
                  JOIN accounts a ON a.id = m.account_id
                  JOIN deal_types dt ON dt.id = m.deal_type_id
                  LEFT JOIN divisions d ON d.id = m.division_id
                  LEFT JOIN opportunities o ON o.id = m.opportunity_id
                 WHERE {string.Join(" AND ", where)}
                 ORDER BY m.signed_on DESC, m.id DESC
                """, p));
        });

        /* ----------------------------------------- closed internal projects */
        app.MapGet("/api/banking/closed-projects", async (HttpContext ctx, Db db) =>
        {
            ((CurrentUser)ctx.Items["user"]!).Require("mandates.view");
            return Results.Json(await db.Q("""
                SELECT p.code, p.name, d.name AS department, u.name AS owner,
                       to_char(p.closed_on, 'YYYY-MM-DD') AS closed_on,
                       (SELECT COUNT(*) FROM assignments a
                         WHERE a.project_id = p.id AND a.deleted_at IS NULL) AS assignments,
                       (SELECT COUNT(*) FROM assignments a
                         WHERE a.project_id = p.id AND a.deleted_at IS NULL AND a.status = 'Completed') AS completed,
                       (SELECT COALESCE(SUM(a.actual_hours),0) FROM assignments a
                         WHERE a.project_id = p.id AND a.deleted_at IS NULL) AS hours
                  FROM projects p
                  LEFT JOIN departments d ON d.id = p.department_id
                  LEFT JOIN users u ON u.id = p.owner_id
                 WHERE p.status = 'Closed'
                 ORDER BY p.closed_on DESC NULLS LAST, p.name
                """));
        });

        /* ---------------------------------------------------------- detail */
        app.MapGet("/api/mandates/{id:int}", async (HttpContext ctx, Db db, int id) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("mandates.view");
            var (scopeSql, p) = Scope(u);
            p.Add("id", id);

            var row = await db.One($"""
                SELECT m.*, a.name AS account, a.account_code, dt.name AS deal_type, d.name AS division,
                       o.opportunity_no,
                       ROUND(100.0 * m.realised_fee_l / NULLIF(m.estimated_fee_l,0)) AS realisation_pct
                  FROM mandates m
                  JOIN accounts a ON a.id = m.account_id
                  JOIN deal_types dt ON dt.id = m.deal_type_id
                  LEFT JOIN divisions d ON d.id = m.division_id
                  LEFT JOIN opportunities o ON o.id = m.opportunity_id
                 WHERE m.id = @id AND m.deleted_at IS NULL AND {scopeSql}
                """, p) ?? throw AppException.NotFound("No such mandate, or it is outside what you can see");

            row.milestones = await db.Q("""
                SELECT id, name, sort_order, to_char(due_date,'YYYY-MM-DD') AS due_date,
                       is_done::integer AS is_done, to_char(done_at,'YYYY-MM-DD') AS done_at
                  FROM mandate_milestones WHERE mandate_id = @id ORDER BY sort_order, id
                """, new { id });
            row.team = await db.Q("""
                SELECT u.id, u.name, mt.team_role FROM mandate_team mt
                  JOIN users u ON u.id = mt.user_id
                 WHERE mt.mandate_id = @id ORDER BY mt.team_role, u.name
                """, new { id });
            row.fees = await db.Q("""
                SELECT id, fee_type, amount_l, to_char(received_on,'YYYY-MM-DD') AS received_on,
                       status, narration FROM fee_receipts
                 WHERE mandate_id = @id ORDER BY COALESCE(received_on, invoice_date) DESC NULLS LAST, id DESC
                """, new { id });
            row.assignments = await db.Q("""
                SELECT a.id, a.assignment_no, a.title, a.status, ut.name AS owner,
                       to_char(a.due_date,'YYYY-MM-DD') AS due_date
                  FROM assignments a
                  LEFT JOIN users ut ON ut.id = a.assigned_to
                 WHERE a.linked_type = 'mandate' AND a.linked_id = @id AND a.deleted_at IS NULL
                 ORDER BY a.due_date
                """, new { id });
            row.activity = await db.Q("""
                SELECT a.action, a.description, a.created_at, u.name AS who
                  FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
                 WHERE a.entity_type = 'mandate' AND a.entity_id = @id
                 ORDER BY a.created_at DESC LIMIT 100
                """, new { id });
            return Results.Json((object)row);
        });

        /* ------------------------------------------------ create a mandate */
        app.MapPost("/api/mandates", async (HttpContext ctx, Db db, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("mandates.create");
            var signedOn = b.Str("signed_on");
            var team = b.IntArray("team");
            var status = b.Choice("status", Statuses, "Active");

            var id = await db.Tx(async (conn, tx) =>
            {
                var no = await Db.NextNo(conn, tx, "mandates", "mandate_no", "MND", fyPrefix: true);
                var mid = await conn.ExecuteScalarAsync<int>("""
                    INSERT INTO mandates
                      (mandate_no, account_id, opportunity_id, division_id, deal_type_id, signed_on,
                       expected_end, retainer_l, success_fee_pct, estimated_fee_l, txn_value_cr,
                       status, created_by)
                    VALUES (@no, @account, @opp, @division, @dealType, CAST(@signed AS date),
                            CAST(@end AS date), @retainer, @successPct, @estimated, @txn, @status, @me)
                    RETURNING id
                    """, new
                {
                    no, account = b.Int("account_id"), opp = b.OptInt("opportunity_id"),
                    division = b.OptInt("division_id"), dealType = b.Int("deal_type_id"),
                    signed = signedOn, end = b.OptStr("expected_end"),
                    retainer = b.Dec("retainer_l"), successPct = b.Dec("success_fee_pct"),
                    estimated = b.Dec("estimated_fee_l"), txn = b.Dec("txn_value_cr"),
                    status, me = u.Id
                }, tx);

                for (var i = 0; i < DefaultMilestones.Length; i++)
                    await conn.ExecuteAsync("""
                        INSERT INTO mandate_milestones (mandate_id, name, sort_order, due_date)
                        VALUES (@mid, @name, @order, CAST(@signed AS date) + @days)
                        """, new { mid, name = DefaultMilestones[i], order = i + 1, signed = signedOn, days = (i + 1) * 22 }, tx);

                for (var i = 0; i < team.Length; i++)
                    await conn.ExecuteAsync("""
                        INSERT INTO mandate_team (mandate_id, user_id, team_role) VALUES (@mid, @uid, @role)
                        ON CONFLICT DO NOTHING
                        """, new { mid, uid = team[i], role = i == 0 ? "Lead" : "Execution" }, tx);
                return mid;
            });

            await Audit.LogActivity(db, ctx, "mandate", id, "created", "Mandate created");
            foreach (var member in team.Where(t => t != u.Id))
                await Audit.Notify(db, member, "Mandate", "Added to a mandate",
                    "You have been added to the deal team on a new mandate.", "mandate", id, u.Id);
            return Results.Json(new { id }, statusCode: 201);
        });

        /* ---------------------------- edit / close / compliance / details */
        app.MapPatch("/api/mandates/{id:int}", async (HttpContext ctx, Db db, int id, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("mandates.edit");
            var cur = await db.One(
                "SELECT status, opportunity_id FROM mandates WHERE id = @id AND deleted_at IS NULL", new { id })
                ?? throw AppException.NotFound();

            var sets = new List<string>();
            var p = new DynamicParameters();
            p.Add("id", id);

            var status = b.OptStr("status");
            if (status is not null)
            {
                if (!Statuses.Contains(status)) throw AppException.BadRequest("Unknown status");
                sets.Add("status = @status"); p.Add("status", status);
                if (status is "Executed" or "Terminated")
                {
                    sets.Add("closed_on = COALESCE(CAST(@closedOn AS date), closed_on, CURRENT_DATE)");
                    p.Add("closedOn", b.OptStr("closed_on"));
                }
            }
            foreach (var (key, col) in new[] {
                ("retainer_l","retainer_l"), ("success_fee_pct","success_fee_pct"),
                ("estimated_fee_l","estimated_fee_l"), ("txn_value_cr","txn_value_cr") })
                if (b.ContainsKey(key)) { sets.Add($"{col} = @{col}"); p.Add(col, b.Dec(key)); }
            if (b.ContainsKey("expected_end")) { sets.Add("expected_end = CAST(@end AS date)"); p.Add("end", b.OptStr("expected_end")); }
            // These flag columns are booleans in this database — write booleans.
            foreach (var flag in new[] { "sebi_cleared", "kyc_cleared", "agreement_signed" })
                if (b.ContainsKey(flag)) { sets.Add($"{flag} = @{flag}"); p.Add(flag, b.Bool(flag)); }

            if (sets.Count == 0) throw AppException.BadRequest("Nothing to change");
            sets.Add("updated_at = NOW()");
            await db.Exec($"UPDATE mandates SET {string.Join(", ", sets)} WHERE id = @id", p);

            if (status is not null && status != (string)cur.status)
            {
                await Audit.LogActivity(db, ctx, "mandate", id, "status",
                    $"Mandate {status.ToLower()}", (string?)cur.status, status);
                // an executed mandate finishes its source opportunity's journey
                if (status == "Executed" && cur.opportunity_id != null)
                    await db.Exec("""
                        UPDATE opportunities SET stage = 'Closed Won', probability_pct = 100
                         WHERE id = @oid AND deleted_at IS NULL
                        """, new { oid = (int)cur.opportunity_id });
            }
            else
                await Audit.LogActivity(db, ctx, "mandate", id, "updated", "Mandate updated");
            return Results.Json(new { ok = true });
        });

        /* ---------------------------------------------- record a fee received */
        app.MapPost("/api/mandates/{id:int}/fees", async (HttpContext ctx, Db db, int id, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("fees.create");
            var amount = b.Dec("amount_l");
            if (amount <= 0) throw AppException.BadRequest("Enter an amount greater than zero");
            await db.Exec("""
                INSERT INTO fee_receipts (mandate_id, fee_type, amount_l, received_on, status, narration, recorded_by)
                VALUES (@id, @feeType, @amount, CAST(@on AS date), 'Received', @narration, @me)
                """, new
            {
                id,
                feeType = b.Choice("fee_type", ["Retainer", "Success Fee", "Milestone", "Reimbursement"], "Retainer"),
                amount, on = b.OptStr("received_on"), narration = b.OptStr("narration"), me = u.Id
            });
            await Audit.LogActivity(db, ctx, "mandate", id, "fee", $"Fee received ₹{amount}L");
            var realised = await db.Scalar<decimal>("SELECT realised_fee_l FROM mandates WHERE id = @id", new { id });
            return Results.Json(new { realised_fee_l = realised }, statusCode: 201);
        });

        /* ------------------------------------------------- toggle a milestone */
        app.MapPatch("/api/mandates/{id:int}/milestones/{mid:int}", async (HttpContext ctx, Db db, int id, int mid, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("mandates.edit");
            var done = b.Bool("is_done");
            // is_done is a real boolean column in this database, so write a boolean.
            var n = await db.Exec("""
                UPDATE mandate_milestones
                   SET is_done = @done,
                       done_by = CASE WHEN @done THEN @me ELSE NULL END,
                       done_at = CASE WHEN @done THEN NOW() ELSE NULL END
                 WHERE id = @mid AND mandate_id = @id
                """, new { done, me = u.Id, mid, id });
            if (n == 0) throw AppException.NotFound();
            var name = await db.Scalar<string>("SELECT name FROM mandate_milestones WHERE id = @mid", new { mid });
            await Audit.LogActivity(db, ctx, "mandate", id,
                done ? "milestone_done" : "milestone_reopen",
                (done ? "Milestone completed: " : "Milestone reopened: ") + name);
            return Results.Json(new { ok = true });
        });

        /* -------------------------------------------------- execution note */
        app.MapPost("/api/mandates/{id:int}/notes", async (HttpContext ctx, Db db, int id, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("mandates.view");
            var note = b.Str("note");
            await Audit.LogActivity(db, ctx, "mandate", id, "note", note);
            return Results.Json(new { ok = true }, statusCode: 201);
        });

        /* ------------------------------------------------- soft-delete (rare) */
        app.MapDelete("/api/mandates/{id:int}", async (HttpContext ctx, Db db, int id) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("mandates.edit");
            var n = await db.Exec(
                "UPDATE mandates SET deleted_at = NOW() WHERE id = @id AND deleted_at IS NULL", new { id });
            if (n == 0) throw AppException.NotFound();
            await Audit.LogActivity(db, ctx, "mandate", id, "deleted", "Mandate removed");
            return Results.Json(new { ok = true });
        });
    }
}
