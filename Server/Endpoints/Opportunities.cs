/* =====================================================================
   The banking pipeline: opportunities, the board, stage moves, the
   assignment dialog, and conversion to a mandate — one transaction, so
   a half-converted deal cannot exist. Ported from routes/opportunities.js.
   ===================================================================== */
using System.Text.Json;
using AshikaWdm.Infrastructure;
using Dapper;

namespace AshikaWdm.Endpoints;

using B = Dictionary<string, JsonElement>;

public static class OpportunityEndpoints
{
    private static readonly string[] Stages =
        ["Lead", "Qualified", "Pitched", "Term Sheet", "Mandated", "Closed Won", "Lost"];
    private static readonly string[] Open =
        ["Lead", "Qualified", "Pitched", "Term Sheet", "Mandated"];

    private static string ListSql(string where) => $"""
        SELECT o.id, o.opportunity_no, o.stage, o.txn_size_cr, o.expected_fee_l, o.probability_pct,
               o.weighted_fee_l, o.expected_close, o.next_action, o.next_action_due, o.is_converted,
               a.name AS account, a.account_code, dt.name AS deal_type, dv.name AS division,
               u.id AS owner_id, u.name AS owner,
               (CURRENT_DATE - o.created_at::date) AS age_days,
               (SELECT STRING_AGG(tu.name, ', ' ORDER BY tu.name)
                  FROM opportunity_team ot JOIN users tu ON tu.id = ot.user_id
                 WHERE ot.opportunity_id = o.id) AS team,
               (SELECT COUNT(*) FROM attachments at
                 WHERE at.entity_type = 'opportunity' AND at.entity_id = o.id) AS attachments
          FROM opportunities o
          JOIN accounts a    ON a.id = o.account_id
          JOIN deal_types dt ON dt.id = o.deal_type_id
          JOIN users u       ON u.id = o.owner_id
          LEFT JOIN divisions dv ON dv.id = o.division_id
         WHERE o.deleted_at IS NULL AND {where}
        """;

    /* The board reads best-first, the way the desk reads it. */
    private const string StageOrder = """
        array_position(ARRAY['Term Sheet','Mandated','Pitched','Qualified','Lead','Closed Won','Lost'], o.stage)
        """;

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/opportunities", async (HttpContext ctx, Db db) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("opportunities.view");
            var s = Scope.Banking(u);
            var where = new List<string> { s.Sql };
            var p = new DynamicParameters();
            p.Add("people", s.People); p.Add("divId", s.DivisionId); p.Add("uid", s.UserId);

            var qs = ctx.Request.Query;
            if (qs["open"] == "1")
                where.Add($"o.is_converted = 0 AND o.stage IN ('{string.Join("','", Open)}')");
            if (!string.IsNullOrEmpty(qs["stage"])) { where.Add("o.stage = @stage"); p.Add("stage", (string)qs["stage"]!); }
            if (!string.IsNullOrEmpty(qs["division"])) { where.Add("o.division_id = @div"); p.Add("div", int.Parse(qs["division"]!)); }
            if (!string.IsNullOrEmpty(qs["owner"])) { where.Add("o.owner_id = @owner"); p.Add("owner", int.Parse(qs["owner"]!)); }
            if (!string.IsNullOrEmpty(qs["q"]))
            {
                where.Add("(a.name ILIKE @q OR o.opportunity_no ILIKE @q OR o.next_action ILIKE @q)");
                p.Add("q", $"%{qs["q"]}%");
            }

            return Results.Json(await db.Q(
                ListSql(string.Join(" AND ", where)) +
                $" ORDER BY {StageOrder}, o.expected_close", p));
        });

        /* GET /api/opportunities/board — grouped for the pipeline board */
        app.MapGet("/api/opportunities/board", async (HttpContext ctx, Db db) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("opportunities.view");
            var s = Scope.Banking(u);
            var rows = (await db.Q(ListSql($"{s.Sql} AND o.is_converted = 0"),
                new { people = s.People, divId = s.DivisionId, uid = s.UserId })).ToList();

            var board = new Dictionary<string, object>();
            foreach (var stage in Stages)
            {
                var deals = rows.Where(x => (string)x.stage == stage).ToList();
                board[stage] = new
                {
                    deals,
                    count = deals.Count,
                    fee_l = deals.Sum(x => (decimal)x.expected_fee_l)
                };
            }
            return Results.Json(board);
        });

        app.MapGet("/api/opportunities/{id:int}", async (HttpContext ctx, Db db, int id) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("opportunities.view");
            var s = Scope.Banking(u);
            var row = await db.One(ListSql($"{s.Sql} AND o.id = @id"),
                new { people = s.People, divId = s.DivisionId, uid = s.UserId, id })
                ?? throw AppException.NotFound("No such opportunity, or it is outside what you can see");

            var oid = (int)row.id;
            row.notes = await db.Q("""
                SELECT n.id, n.note_at, n.comment, u.name AS author
                  FROM opportunity_notes n JOIN users u ON u.id = n.user_id
                 WHERE n.opportunity_id = @oid ORDER BY n.note_at DESC
                """, new { oid });
            row.history = await db.Q("""
                SELECT h.from_stage, h.to_stage, h.days_in_stage, h.moved_at, u.name AS moved_by
                  FROM opportunity_stage_history h LEFT JOIN users u ON u.id = h.moved_by
                 WHERE h.opportunity_id = @oid ORDER BY h.moved_at DESC
                """, new { oid });
            row.attachments = await db.Q("""
                SELECT id, kind, original_name, url, mime_type, size_bytes, duration_secs, created_at
                  FROM attachments WHERE entity_type = 'opportunity' AND entity_id = @oid
                """, new { oid });
            return Results.Json((object)row);
        });

        app.MapPost("/api/opportunities", async (HttpContext ctx, Db db, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("opportunities.create");

            var stage = b.Choice("stage", Stages, "Lead");
            var accountId = b.Int("account_id");
            var dealTypeId = b.Int("deal_type_id");
            var ownerId = b.Int("owner_id");
            var probability = b.OptInt("probability_pct") ?? 0;
            if (probability is < 0 or > 100)
                throw AppException.BadRequest("probability_pct must be between 0 and 100");
            var team = b.IntArray("team");

            var id = await db.Tx(async (conn, tx) =>
            {
                var no = await Db.NextNo(conn, tx, "opportunities", "opportunity_no", "OPP", fyPrefix: true);
                var oid = await conn.ExecuteScalarAsync<int>("""
                    INSERT INTO opportunities
                      (opportunity_no, account_id, division_id, deal_type_id, stage, txn_size_cr,
                       expected_fee_l, probability_pct, expected_close, owner_id, source,
                       next_action, next_action_due, created_by)
                    VALUES (@no, @account, @division, @dealType, @stage, @txn, @fee, @prob,
                            CAST(@close AS date), @owner, @source, @nextAction, CAST(@nextDue AS date), @me)
                    RETURNING id
                    """, new
                {
                    no, account = accountId, division = b.OptInt("division_id"),
                    dealType = dealTypeId, stage,
                    txn = b.Dec("txn_size_cr"), fee = b.Dec("expected_fee_l"), prob = probability,
                    close = b.OptStr("expected_close"), owner = ownerId,
                    source = b.OptStr("source") ?? "Referral",
                    nextAction = b.OptStr("next_action"), nextDue = b.OptStr("next_action_due"),
                    me = u.Id
                }, tx);

                foreach (var uid in team.Where(x => x != ownerId))
                    await conn.ExecuteAsync(
                        "INSERT INTO opportunity_team (opportunity_id, user_id) VALUES (@oid, @uid)",
                        new { oid, uid }, tx);

                await conn.ExecuteAsync("""
                    INSERT INTO opportunity_stage_history (opportunity_id, to_stage, moved_by, moved_at)
                    VALUES (@oid, @stage, @me, NOW())
                    """, new { oid, stage, me = u.Id }, tx);
                return oid;
            });

            await Audit.LogActivity(db, ctx, "opportunity", id, "created", "Opportunity created");
            return Results.Json(new { id }, statusCode: 201);
        });

        /* PATCH /api/opportunities/{id}/stage — the board's drop handler */
        app.MapPatch("/api/opportunities/{id:int}/stage", async (HttpContext ctx, Db db, int id, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("opportunities.move_stage");
            var stage = b.Choice("stage", Stages, "");

            var row = await db.One(
                "SELECT id, stage, owner_id, opportunity_no FROM opportunities WHERE id = @id",
                new { id }) ?? throw AppException.NotFound();

            var extra = stage switch
            {
                "Closed Won" => ", probability_pct = 100, closed_at = CURRENT_DATE",
                "Lost" => ", probability_pct = 0, closed_at = CURRENT_DATE",
                _ => ""
            };
            await db.Exec($"UPDATE opportunities SET stage = @stage{extra} WHERE id = @id",
                new { stage, id });

            await Audit.LogActivity(db, ctx, "opportunity", id, "stage_moved",
                $"Stage moved from {row.stage} to {stage}", (string)row.stage, stage);
            await Audit.Notify(db, (int)row.owner_id, "Stage Moved", "Stage moved",
                $"{row.opportunity_no} moved to {stage}.", "opportunity", id);
            return Results.Json(new { ok = true });
        });

        /* PATCH /api/opportunities/{id}/assign — owner and support team together */
        app.MapPatch("/api/opportunities/{id:int}/assign", async (HttpContext ctx, Db db, int id, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("opportunities.edit");
            var ownerId = b.Int("owner_id");
            var note = b.OptStr("note");

            var row = await db.One("""
                SELECT o.id, o.owner_id, o.opportunity_no, a.name AS account
                  FROM opportunities o JOIN accounts a ON a.id = o.account_id WHERE o.id = @id
                """, new { id }) ?? throw AppException.NotFound();

            var before = (await db.Q(
                "SELECT user_id FROM opportunity_team WHERE opportunity_id = @id", new { id }))
                .Select(x => (int)x.user_id).ToHashSet();
            var team = b.IntArray("team").Where(x => x != ownerId).ToArray();

            await db.Tx<int>(async (conn, tx) =>
            {
                await conn.ExecuteAsync("UPDATE opportunities SET owner_id = @ownerId WHERE id = @id",
                    new { ownerId, id }, tx);
                await conn.ExecuteAsync("DELETE FROM opportunity_team WHERE opportunity_id = @id",
                    new { id }, tx);
                foreach (var uid in team)
                    await conn.ExecuteAsync(
                        "INSERT INTO opportunity_team (opportunity_id, user_id) VALUES (@id, @uid)",
                        new { id, uid }, tx);
                if (!string.IsNullOrEmpty(note))
                    await conn.ExecuteAsync("""
                        INSERT INTO opportunity_notes (opportunity_id, user_id, note_at, comment)
                        VALUES (@id, @me, NOW(), @comment)
                        """, new { id, me = u.Id, comment = $"On assignment: {note}" }, tx);
                return 0;
            });

            var previousOwner = (int)row.owner_id;
            if (ownerId != previousOwner)
            {
                await Audit.LogActivity(db, ctx, "opportunity", id, "reassigned",
                    $"Reassigned to user {ownerId}", previousOwner.ToString(), ownerId.ToString());
                await Audit.Notify(db, ownerId, "New Assignment", "You own a deal",
                    $"{row.opportunity_no} {row.account} is now yours.", "opportunity", id);
                await Audit.Notify(db, previousOwner, "Status Changed", "A deal moved on",
                    $"{row.opportunity_no} has moved to another owner.", "opportunity", id);
            }
            foreach (var uid in team.Where(x => !before.Contains(x)))
                await Audit.Notify(db, uid, "New Assignment", "Added to a deal",
                    $"You have been added to {row.opportunity_no} {row.account}.", "opportunity", id);

            return Results.Json(new { ok = true });
        });

        /* POST /api/opportunities/{id}/convert — creates the mandate, its
           milestones and the deal team, and takes the opportunity out of the
           pipeline. */
        app.MapPost("/api/opportunities/{id:int}/convert", async (HttpContext ctx, Db db, int id, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("mandates.create");
            var signedOn = b.Str("signed_on");
            var team = b.IntArray("team");

            var opp = await db.One(
                "SELECT * FROM opportunities WHERE id = @id AND deleted_at IS NULL", new { id })
                ?? throw AppException.NotFound();
            if (Convert.ToInt32(opp.is_converted) == 1)
                throw AppException.Conflict("This opportunity has already become a mandate");

            string[] milestones = ["Kick-off", "Due diligence", "Documentation", "Regulatory filing",
                                   "Roadshow / marketing", "Closing", "Fee realisation"];

            var mandateId = await db.Tx(async (conn, tx) =>
            {
                var no = await Db.NextNo(conn, tx, "mandates", "mandate_no", "MND", fyPrefix: true);
                var mid = await conn.ExecuteScalarAsync<int>("""
                    INSERT INTO mandates
                      (mandate_no, account_id, opportunity_id, division_id, deal_type_id, signed_on,
                       expected_end, retainer_l, success_fee_pct, estimated_fee_l, txn_value_cr,
                       status, created_by)
                    VALUES (@no, @account, @opp, @division, @dealType, CAST(@signed AS date),
                            CAST(@end AS date), @retainer, @successPct, @estimated, @txn, 'Active', @me)
                    RETURNING id
                    """, new
                {
                    no, account = (int)opp.account_id, opp = (int)opp.id,
                    division = (int?)opp.division_id, dealType = (int)opp.deal_type_id,
                    signed = signedOn, end = b.OptStr("expected_end"),
                    retainer = b.Dec("retainer_l"), successPct = b.Dec("success_fee_pct"),
                    estimated = b.Dec("estimated_fee_l"),
                    txn = b.Dec("txn_value_cr") != 0 ? b.Dec("txn_value_cr") : (decimal)opp.txn_size_cr,
                    me = u.Id
                }, tx);

                for (var i = 0; i < milestones.Length; i++)
                    await conn.ExecuteAsync("""
                        INSERT INTO mandate_milestones (mandate_id, name, sort_order, due_date)
                        VALUES (@mid, @name, @order, CAST(@signed AS date) + @days)
                        """,
                        new { mid, name = milestones[i], order = i + 1, signed = signedOn, days = (i + 1) * 22 }, tx);

                for (var i = 0; i < team.Length; i++)
                    await conn.ExecuteAsync("""
                        INSERT INTO mandate_team (mandate_id, user_id, team_role)
                        VALUES (@mid, @uid, @role)
                        """, new { mid, uid = team[i], role = i == 0 ? "Lead" : "Execution" }, tx);

                await conn.ExecuteAsync("""
                    UPDATE opportunities SET is_converted = 1, stage = 'Mandated', probability_pct = 90,
                           next_action = 'Converted to mandate ' || @no WHERE id = @id
                    """, new { no, id }, tx);
                return mid;
            });

            await Audit.LogActivity(db, ctx, "opportunity", id, "converted",
                "Converted to a mandate and left the pipeline");
            return Results.Json(new { mandate_id = mandateId }, statusCode: 201);
        });

        app.MapPost("/api/opportunities/{id:int}/notes", async (HttpContext ctx, Db db, int id, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.Require("opportunities.view");
            var comment = b.Str("comment");
            await db.Exec("""
                INSERT INTO opportunity_notes (opportunity_id, user_id, note_at, comment)
                VALUES (@id, @me, NOW(), @comment)
                """, new { id, me = u.Id, comment });
            await Audit.LogActivity(db, ctx, "opportunity", id, "note_added", "Note added");
            return Results.Json(new { ok = true }, statusCode: 201);
        });
    }
}
