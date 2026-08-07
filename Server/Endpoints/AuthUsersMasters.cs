/* =====================================================================
   Sign-in, the signed-in user, user administration and the masters.
   Ported from routes/auth.js, routes/users.js and routes/masters.js.
   ===================================================================== */
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AshikaWdm.Infrastructure;
using Dapper;

namespace AshikaWdm.Endpoints;

using B = Dictionary<string, JsonElement>;

public static class AuthEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapPost("/api/auth/login", async (HttpContext ctx, Db db, Tokens tokens, B body) =>
        {
            var identifier = body.Str("identifier");
            var password = body.Str("password");

            var user = await db.One("""
                SELECT id, name, email, employee_code, password_hash, status
                  FROM users WHERE email = @identifier OR employee_code = @identifier
                """, new { identifier });

            /* Verify against a dummy hash when the user is missing, so a wrong
               address and a wrong password take the same time to answer. */
            var hash = (string?)user?.password_hash ?? Passwords.Dummy;
            var ok = Passwords.Verify(password, hash);

            if (user is null || !ok)
                throw AppException.Unauthorised("Those credentials do not match any account");
            if ((string)user.status != "Active")
                throw AppException.Unauthorised("This account is inactive");

            await db.Exec("UPDATE users SET last_login_at = NOW() WHERE id = @id", new { id = (int)user.id });

            return Results.Json(new
            {
                token = tokens.Issue((int)user.id),
                user = new { id = (int)user.id, name = (string)user.name, email = (string)user.email }
            });
        }).RequireRateLimiting("login");

        app.MapGet("/api/auth/me", (HttpContext ctx) =>
  {
      // If the token isn't valid or user isn't attached to HttpContext, return 401 instead of crashing with a 500
      if (ctx.Items["user"] is not CurrentUser u)
      {
          return Results.Unauthorized();
      }

      return Results.Json(new
      {
          id = u.Id,
          name = u.Name,
          email = u.Email,
          level = u.Level,
          scope = u.ScopeKind,
          department = u.Department ?? "",
          division = u.Division ?? "",
          permissions = u.Permissions?.ToArray() ?? Array.Empty<string>()
      });
  });

        /* Forgot password — generates a single-use, one-hour token, stores only
           its SHA-256 hash, and emails the user a reset link. Always answers the
           same way so the form never reveals whether an account exists. */
        app.MapPost("/api/auth/forgot", async (HttpContext ctx, Db db, Mailer mailer, IConfiguration cfg, B body) =>
        {
            var identifier = body.Str("identifier");
            var user = await db.One("""
                SELECT id, name, email FROM users
                 WHERE (email = @id OR employee_code = @id) AND status = 'Active'
                """, new { id = identifier });

            if (user is not null)
            {
                var raw = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));   // 64 hex chars
                var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw)));

                // one live token per user — retire any earlier unused ones
                await db.Exec(
                    "UPDATE password_resets SET used_at = NOW() WHERE user_id = @uid AND used_at IS NULL",
                    new { uid = (int)user.id });
                await db.Exec("""
                    INSERT INTO password_resets (user_id, token_hash, expires_at)
                    VALUES (@uid, @hash, NOW() + INTERVAL '1 hour')
                    """, new { uid = (int)user.id, hash = tokenHash });

                var baseUrl = (cfg["App:BaseUrl"]?.TrimEnd('/'))
                    ?? $"{ctx.Request.Scheme}://{ctx.Request.Host}";
                var link = $"{baseUrl}/reset-password?token={raw}";
                var name = (string)user.name;
                var html = $"""
                    <div style="font-family:Arial,sans-serif;font-size:14px;color:#1A2233">
                      <p>Hi {System.Net.WebUtility.HtmlEncode(name)},</p>
                      <p>We received a request to reset your Ashika WDM password. Click the button below
                         to choose a new one. This link expires in <b>one hour</b> and can be used once.</p>
                      <p style="margin:22px 0">
                        <a href="{link}" style="background:#23408E;color:#fff;text-decoration:none;
                           padding:11px 20px;border-radius:6px;display:inline-block">Reset your password</a></p>
                      <p style="font-size:12.5px;color:#69748A">Or paste this link into your browser:<br>{link}</p>
                      <p style="font-size:12.5px;color:#69748A">If you didn't ask for this, you can ignore this email —
                         your password stays the same.</p>
                    </div>
                    """;
                try
                {
                    await mailer.SendAsync((string)user.email, "Reset your Ashika WDM password", html);
                }
                catch (Exception ex)
                {
                    app.Logger.LogError(ex, "Password reset email to {Email} failed", (string)user.email);
                }

                await db.Exec("""
                    INSERT INTO activity_logs (entity_type, entity_id, user_id, action, description, ip_address)
                    VALUES ('user', @uid, @uid, 'password_reset_requested', 'Password reset link emailed', @ip)
                    """, new { uid = (int)user.id, ip = ctx.Connection.RemoteIpAddress?.ToString() });
            }
            return Results.Json(new { ok = true });
        }).RequireRateLimiting("login");

        /* Check a token before showing the reset form. */
        app.MapGet("/api/auth/reset/validate", async (HttpContext ctx, Db db) =>
        {
            var token = ctx.Request.Query["token"].ToString();
            if (string.IsNullOrWhiteSpace(token)) return Results.Json(new { valid = false });
            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
            var live = await db.Scalar<long>("""
                SELECT COUNT(*) FROM password_resets
                 WHERE token_hash = @hash AND used_at IS NULL AND expires_at > NOW()
                """, new { hash });
            return Results.Json(new { valid = live > 0 });
        });

        /* Set the new password from a valid reset token. */
        app.MapPost("/api/auth/reset", async (HttpContext ctx, Db db, B body) =>
        {
            var token = body.Str("token");
            var password = body.Str("password");
            if (password.Length < 8) throw AppException.BadRequest("The new password needs at least 8 characters");

            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
            var row = await db.One("""
                SELECT pr.id, pr.user_id, u.name, u.email
                  FROM password_resets pr JOIN users u ON u.id = pr.user_id
                 WHERE pr.token_hash = @hash AND pr.used_at IS NULL AND pr.expires_at > NOW()
                """, new { hash })
                ?? throw AppException.BadRequest("This reset link is invalid or has expired. Request a new one.");

            var uid = (int)row.user_id;
            await db.Tx<int>(async (conn, tx) =>
            {
                await conn.ExecuteAsync("UPDATE users SET password_hash = @h WHERE id = @uid",
                    new { h = Passwords.Hash(password), uid }, tx);
                // consume this token and invalidate any other live ones for the user
                await conn.ExecuteAsync(
                    "UPDATE password_resets SET used_at = NOW() WHERE user_id = @uid AND used_at IS NULL",
                    new { uid }, tx);
                return 0;
            });

            await db.Exec("""
                INSERT INTO activity_logs (entity_type, entity_id, user_id, action, description, ip_address)
                VALUES ('user', @uid, @uid, 'password_reset', 'Password reset via email link', @ip)
                """, new { uid, ip = ctx.Connection.RemoteIpAddress?.ToString() });
            await Audit.Notify(db, uid, "Security", "Password changed",
                "Your password was just reset. If this wasn't you, tell a Super Admin now.", "user", (long)uid);

            return Results.Json(new { ok = true });
        }).RequireRateLimiting("login");

        /* Change your own password while signed in. Verifies the current password,
           applies the same policy used elsewhere (>= 8 chars, must differ), updates
           the PBKDF2 hash, records an audit entry and sends a confirming notice.
           Independent of the email-based forgot/reset flow above. */
        app.MapPost("/api/auth/change-password", async (HttpContext ctx, Db db, B body) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            var current = body.Str("current");
            var next = body.Str("next");

            var row = await db.One("SELECT password_hash FROM users WHERE id = @id", new { id = u.Id });
            if (!Passwords.Verify(current, (string)row!.password_hash))
                throw AppException.BadRequest("The current password is wrong");
            if (next.Length < 8) throw AppException.BadRequest("The new password needs at least 8 characters");
            if (next == current) throw AppException.BadRequest("The new password must be different from your current one");

            await db.Exec("UPDATE users SET password_hash = @h WHERE id = @id",
                new { h = Passwords.Hash(next), id = u.Id });

            await Audit.LogActivity(db, ctx, "user", u.Id, "password_changed", "Changed their password");
            await Audit.Notify(db, u.Id, "Security", "Password changed",
                "Your password was just changed. If this wasn't you, tell a Super Admin now.", "user", (long)u.Id);
            return Results.Json(new { ok = true });
        });
    }
}

public static class UserEndpoints
{
    public static void Map(WebApplication app)
    {
        /* Roles, for the user form's access-level picker. */
        app.MapGet("/api/roles", async (HttpContext ctx, Db db) =>
        {
            ((CurrentUser)ctx.Items["user"]!).Require("users.view");
            return Results.Json(await db.Q("SELECT id, name, slug, level, scope FROM roles ORDER BY level"));
        });

        app.MapGet("/api/users", async (HttpContext ctx, Db db) =>
        {
            ((CurrentUser)ctx.Items["user"]!).Require("users.view");
            return Results.Json(await db.Q("""
                SELECT u.id, u.employee_code, u.name, u.email, u.mobile, u.designation, u.status,
                       u.weekly_capacity_hours, u.role_id, u.department_id, u.division_id, u.manager_id,
                       r.name AS role, r.level, r.scope,
                       d.name AS department, dv.name AS division, m.name AS manager,
                       (SELECT COUNT(*) FROM assignments a
                         JOIN assignment_assignees aa ON aa.assignment_id = a.id
                        WHERE aa.user_id = u.id AND a.deleted_at IS NULL
                          AND a.status <> 'Completed') AS open_work,
                       (SELECT COUNT(*) FROM user_permissions up WHERE up.user_id = u.id) AS overrides
                  FROM users u
                  JOIN roles r ON r.id = u.role_id
                  LEFT JOIN departments d ON d.id = u.department_id
                  LEFT JOIN divisions dv ON dv.id = u.division_id
                  LEFT JOIN users m ON m.id = u.manager_id
                 ORDER BY r.level, u.name
                """));
        });

        app.MapPost("/api/users", async (HttpContext ctx, Db db, B b) =>
        {
            var me = (CurrentUser)ctx.Items["user"]!;
            me.RequireSuperAdmin();
            var password = b.OptStr("password")
                ?? throw AppException.Conflict("A password is needed for a new user");
            if (password.Length < 8) throw AppException.BadRequest("The password needs at least 8 characters");

            var id = await db.Scalar<int>("""
                INSERT INTO users (employee_code, name, email, mobile, password_hash, department_id,
                                   division_id, designation, manager_id, role_id, weekly_capacity_hours, status)
                VALUES (@code, @name, @email, @mobile, @hash, @dept, @div, @desig, @mgr, @role, @cap, @status)
                RETURNING id
                """, new
            {
                code = b.Str("employee_code"),
                name = b.Str("name"),
                email = b.Str("email"),
                mobile = b.OptStr("mobile"),
                hash = Passwords.Hash(password),
                dept = b.OptInt("department_id"),
                div = b.OptInt("division_id"),
                desig = b.OptStr("designation"),
                mgr = b.OptInt("manager_id"),
                role = b.Int("role_id"),
                cap = b.Dec("weekly_capacity_hours", 40),
                status = b.Choice("status", ["Active", "Inactive"], "Active")
            });

            await Audit.LogActivity(db, ctx, "user", id, "created", $"Created {b.Str("name")}");
            await Audit.Notify(db, id, "Account", "Welcome to Ashika WDM",
                "Your account has been created. Sign in with the credentials your administrator shared.",
                "user", id, me.Id);
            return Results.Json(new { id }, statusCode: 201);
        });

        app.MapPut("/api/users/{id:int}", async (HttpContext ctx, Db db, int id, B b) =>
        {
            var me = (CurrentUser)ctx.Items["user"]!;
            me.RequireSuperAdmin();

            /* never let the last way in disappear */
            var newRoleId = b.OptInt("role_id");
            var newStatus = b.OptStr("status");
            if (newRoleId is not null || newStatus == "Inactive")
            {
                var otherAdmins = await db.Scalar<long>("""
                    SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id
                     WHERE r.level = 1 AND u.status = 'Active' AND u.id <> @id
                    """, new { id });
                var stillAdmin = newRoleId is null
                    || await db.Scalar<int>("SELECT level FROM roles WHERE id = @r", new { r = newRoleId }) == 1;
                if (otherAdmins == 0 && (!stillAdmin || newStatus == "Inactive"))
                    throw AppException.Conflict("This is the last active Super Admin");
            }

            var allowed = new[] { "employee_code", "name", "email", "mobile", "department_id",
                "division_id", "designation", "manager_id", "role_id", "weekly_capacity_hours", "status" };
            var sets = new List<string>();
            var p = new DynamicParameters();
            p.Add("id", id);
            foreach (var key in allowed.Where(b.ContainsKey))
            {
                sets.Add($"{key} = @{key}");
                var v = b[key];
                p.Add(key, v.ValueKind switch
                {
                    JsonValueKind.Number => (object?)v.GetDecimal(),
                    JsonValueKind.String => v.GetString(),
                    _ => null
                });
            }
            if (sets.Count > 0)
                await db.Exec($"UPDATE users SET {string.Join(", ", sets)} WHERE id = @id", p);

            var pw = b.OptStr("password");
            if (!string.IsNullOrEmpty(pw))
            {
                if (pw.Length < 8) throw AppException.BadRequest("The password needs at least 8 characters");
                await db.Exec("UPDATE users SET password_hash = @h WHERE id = @id",
                    new { h = Passwords.Hash(pw), id });
            }

            await Audit.LogActivity(db, ctx, "user", id, "updated", "User updated");
            if (newStatus == "Inactive")
                await Audit.Notify(db, id, "Account", "Account deactivated",
                    "Your account has been set to inactive. Contact a Super Admin if this is unexpected.", "user", id, me.Id);
            else if (!string.IsNullOrEmpty(pw))
                await Audit.Notify(db, id, "Security", "Password changed",
                    "An administrator changed your password.", "user", id, me.Id);
            return Results.Json(new { ok = true });
        });

        /* The rights grid: every permission, and whether this user has it. */
        app.MapGet("/api/users/{id:int}/permissions", async (HttpContext ctx, Db db, int id) =>
        {
            ((CurrentUser)ctx.Items["user"]!).Require("users.view");
            return Results.Json(await db.Q("""
                SELECT p.id, p.slug, p.module, p.action, p.label,
                       (rp.permission_id IS NOT NULL) AS from_role,
                       up.granted AS override
                  FROM permissions p
                  LEFT JOIN role_permissions rp
                         ON rp.permission_id = p.id
                        AND rp.role_id = (SELECT role_id FROM users WHERE id = @id)
                  LEFT JOIN user_permissions up ON up.permission_id = p.id AND up.user_id = @id
                 ORDER BY p.module, p.action
                """, new { id }));
        });

        app.MapPut("/api/users/{id:int}/permissions", async (HttpContext ctx, Db db, int id, B b) =>
        {
            ((CurrentUser)ctx.Items["user"]!).RequireSuperAdmin();
            var overrides = b.ObjArray("overrides");

            await db.Tx<int>(async (conn, tx) =>
            {
                await conn.ExecuteAsync("DELETE FROM user_permissions WHERE user_id = @id", new { id }, tx);
                foreach (var o in overrides)
                    await conn.ExecuteAsync("""
                        INSERT INTO user_permissions (user_id, permission_id, granted)
                        VALUES (@id, @perm, @granted)
                        """,
                        new { id, perm = o.Int("permission_id"), granted = o.Bool("granted") ? 1 : 0 }, tx);
                return 0;
            });

            await Audit.LogActivity(db, ctx, "user", id, "permissions", $"{overrides.Count} override(s) set");
            return Results.Json(new { ok = true });
        });

        app.MapDelete("/api/users/{id:int}", async (HttpContext ctx, Db db, int id) =>
        {
            var me = (CurrentUser)ctx.Items["user"]!;
            me.RequireSuperAdmin();
            if (id == me.Id) throw AppException.Conflict("You cannot delete your own account");

            var row = await db.One("""
                SELECT (SELECT COUNT(*) FROM assignments a
                         JOIN assignment_assignees aa ON aa.assignment_id = a.id
                        WHERE aa.user_id = @id AND a.deleted_at IS NULL
                          AND a.status <> 'Completed') AS open_work,
                       (SELECT COUNT(*) FROM roles r JOIN users u ON u.role_id = r.id
                         WHERE r.level = 1 AND u.status = 'Active' AND u.id <> @id) AS other_admins,
                       (SELECT level FROM roles r JOIN users u ON u.role_id = r.id
                         WHERE u.id = @id) AS level
                """, new { id }) ?? throw AppException.NotFound();
            if (row.level is null) throw AppException.NotFound();
            if (Convert.ToInt32(row.level) == 1 && Convert.ToInt64(row.other_admins) == 0)
                throw AppException.Conflict("This is the last Super Admin");
            if (Convert.ToInt64(row.open_work) > 0)
                throw AppException.Conflict($"{row.open_work} open assignment(s) are with this person");

            await db.Exec("DELETE FROM users WHERE id = @id", new { id });
            await Audit.LogActivity(db, ctx, "user", id, "deleted", "User removed");
            return Results.Json(new { ok = true });
        });
    }
}

public static class MasterEndpoints
{
    /* The masters all behave the same way, so they are described once and
       generated. Renaming carries the records because everything points at
       the id, not the text — which is the whole reason for the id. */
    private sealed record Master(string Table, string[] Fields, (string Table, string Column)[] Usage);

    private static readonly Dictionary<string, Master> Masters = new()
    {
        ["departments"] = new("departments", ["code", "name", "head_user_id"],
            [("users", "department_id"), ("assignments", "department_id")]),
        ["divisions"] = new("divisions", ["code", "name", "head_user_id"],
            [("users", "division_id"), ("opportunities", "division_id"), ("mandates", "division_id")]),
        ["sectors"] = new("sectors", ["name"],
            [("accounts", "sector_id"), ("research_reports", "sector_id")]),
        ["deal-types"] = new("deal_types", ["name", "division_id", "family", "default_fee_pct"],
            [("opportunities", "deal_type_id"), ("mandates", "deal_type_id")]),
        ["groups"] = new("client_groups", ["name", "note"], [("accounts", "group_id")]),
        ["preferences"] = new("preferences", ["name", "pref_type"],
            [("account_preferences", "preference_id")]),
        ["categories"] = new("categories", ["name"], [("assignments", "category_id")]),
        ["work-types"] = new("work_types", ["name", "category", "default_approver_id"],
            [("work_approvals", "work_type_id")]),
        ["countries"] = new("countries", ["name", "dial_code"],
            [("accounts", "country_id"), ("institutions", "country_id")]),
        ["projects"] = new("projects",
            ["code", "name", "department_id", "owner_id", "start_date", "end_date", "status"],
            [("assignments", "project_id")])
    };

    private static Master Find(string key) =>
        Masters.TryGetValue(key, out var m) ? m : throw AppException.NotFound("No such master");

    private static object? Val(JsonElement v) => v.ValueKind switch
    {
        JsonValueKind.Number => v.GetDecimal(),
        JsonValueKind.String => v.GetString(),
        JsonValueKind.True => 1,
        JsonValueKind.False => 0,
        _ => null
    };

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/masters/{master}", async (HttpContext ctx, Db db, string master) =>
        {
            ((CurrentUser)ctx.Items["user"]!).Require("masters.view");
            var m = Find(master);
            var order = m.Fields.Contains("name") ? "name" : "id";
            return Results.Json(await db.Q($"SELECT * FROM {m.Table} ORDER BY {order}"));
        });

        app.MapPost("/api/masters/{master}", async (HttpContext ctx, Db db, string master, B b) =>
        {
            ((CurrentUser)ctx.Items["user"]!).Require("masters.create");
            var m = Find(master);
            var cols = m.Fields.Where(b.ContainsKey).ToArray();
            if (cols.Length == 0) throw AppException.BadRequest("Nothing to save");

            var p = new DynamicParameters();
            foreach (var c in cols) p.Add(c, Val(b[c]));
            var id = await db.Scalar<int>(
                $"INSERT INTO {m.Table} ({string.Join(",", cols)}) " +
                $"VALUES ({string.Join(",", cols.Select(c => "@" + c))}) RETURNING id", p);

            await Audit.LogActivity(db, ctx, m.Table, id, "created", $"Added {b.OptStr("name")}");
            return Results.Json(new { id }, statusCode: 201);
        });

        app.MapPut("/api/masters/{master}/{id:int}", async (HttpContext ctx, Db db, string master, int id, B b) =>
        {
            ((CurrentUser)ctx.Items["user"]!).Require("masters.edit");
            var m = Find(master);
            var cols = m.Fields.Where(b.ContainsKey).ToArray();
            if (cols.Length == 0) throw AppException.BadRequest("Nothing to change");

            var p = new DynamicParameters();
            p.Add("id", id);
            foreach (var c in cols) p.Add(c, Val(b[c]));
            await db.Exec(
                $"UPDATE {m.Table} SET {string.Join(", ", cols.Select(c => $"{c} = @{c}"))} WHERE id = @id", p);

            await Audit.LogActivity(db, ctx, m.Table, id, "updated", $"Updated {b.OptStr("name") ?? ""}");
            return Results.Json(new { ok = true });
        });

        /* Retiring hides it from the dropdowns while the history keeps reading properly. */
        app.MapPatch("/api/masters/{master}/{id:int}/retire",
            async (HttpContext ctx, Db db, string master, int id, B b) =>
        {
            ((CurrentUser)ctx.Items["user"]!).Require("masters.edit");
            var m = Find(master);
            await db.Exec($"UPDATE {m.Table} SET is_active = @a WHERE id = @id",
                new { a = b.Bool("active") ? 1 : 0, id });
            return Results.Json(new { ok = true });
        });

        /* Deleting is refused while anything still points at it, and says how much. */
        app.MapDelete("/api/masters/{master}/{id:int}", async (HttpContext ctx, Db db, string master, int id) =>
        {
            ((CurrentUser)ctx.Items["user"]!).Require("masters.delete");
            var m = Find(master);
            long used = 0;
            foreach (var (table, column) in m.Usage)
                used += await db.Scalar<long>(
                    $"SELECT COUNT(*) FROM {table} WHERE {column} = @id", new { id });
            if (used > 0)
                throw AppException.Conflict($"{used} record(s) still use this. Retire it instead.");

            await db.Exec($"DELETE FROM {m.Table} WHERE id = @id", new { id });
            await Audit.LogActivity(db, ctx, m.Table, id, "deleted", "Removed from the master");
            return Results.Json(new { ok = true });
        });
    }
}
