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
          must_change_password = u.MustChangePassword,
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

            await db.Exec("UPDATE users SET password_hash = @h, must_change_password = 0 WHERE id = @id",
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
    /* One parsed spreadsheet row for the bulk importer. Holds the resolved
       foreign-key ids plus the raw manager reference, so a "Reports to" manager
       who is being created in the SAME file can be linked once every row has an
       id. The record it produces is identical to a manually created user. */
    private sealed class ImpRow
    {
        public int Index;
        public string Code = "", Name = "", Email = "";
        public string? Mobile, Desig;
        public int? DeptId, DivId, MgrId;
        public int RoleId;
        public decimal Cap = 40m;
        public string Status = "Active", Pw = "";
        public bool BaseValid;
        public List<string> Errors = new();
        public string MgrKind = "none";   // id | code | email | none
        public string MgrVal = "";
        public bool MgrDeferred;          // manager is another row in this same file
        public int NewId;
        public string RoleDisplay = "", DeptDisplay = "", MgrDisplay = "";
        public bool Valid => Errors.Count == 0;
    }

    public static void Map(WebApplication app)
    {
        /* Roles, for the user form's access-level picker (Users & Rights → Masters). */
        app.MapGet("/api/roles", async (HttpContext ctx, Db db) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.RequireLevel(2);              // Masters module: Level 1 & 2 only
            u.Require("users.view");
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
                       ((SELECT COUNT(*) FROM accounts ac
                          WHERE ac.owner_id = u.id AND ac.deleted_at IS NULL)
                      + (SELECT COUNT(*) FROM opportunities op
                          WHERE op.owner_id = u.id AND op.deleted_at IS NULL)) AS owns,
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

        /* ---------------------------------------------------------------------
           Bulk user upload. The admin uploads a spreadsheet that the client
           parses to JSON rows; this endpoint validates every row against the
           SAME rules the single-user create uses, then — only when commit=true
           — inserts the valid rows inside ONE transaction so a mid-batch failure
           leaves nothing behind. Passwords from the sheet are hashed with the
           existing hasher and the account is flagged must_change_password so the
           person must set their own password on first sign-in. Duplicates (in
           the database or within the file) and any validation error are reported
           per row and never inserted. commit=false is a dry run for the preview.
           -------------------------------------------------------------------- */
        app.MapPost("/api/users/import", async (HttpContext ctx, Db db, B b) =>
        {
            var me = (CurrentUser)ctx.Items["user"]!;
            me.RequireSuperAdmin();

            var commit = b.Bool("commit");
            var rows = b.ObjArray("rows");
            if (rows.Count == 0) throw AppException.BadRequest("The file has no rows to import");
            if (rows.Count > 1000) throw AppException.BadRequest("Please import at most 1000 rows at a time");

            // Lookups, loaded once. Names/emails/codes are matched case-insensitively
            // and resolved to the same integer foreign keys the manual form's dropdowns
            // produce.
            var roleByName = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var roleIds = new HashSet<int>();
            foreach (var r in await db.Q("SELECT id, name FROM roles")) { roleByName[(string)r.name] = (int)r.id; roleIds.Add((int)r.id); }
            var deptByName = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var deptIds = new HashSet<int>();
            foreach (var d in await db.Q("SELECT id, name FROM departments")) { deptByName[(string)d.name] = (int)d.id; deptIds.Add((int)d.id); }
            var divByName = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var divIds = new HashSet<int>();
            foreach (var d in await db.Q("SELECT id, name FROM divisions")) { divByName[(string)d.name] = (int)d.id; divIds.Add((int)d.id); }
            var usersByEmail = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var usersByCode = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var userIds = new HashSet<int>();
            foreach (var u in await db.Q("SELECT id, email, employee_code FROM users"))
            {
                usersByEmail[(string)u.email] = (int)u.id;
                usersByCode[(string)u.employee_code] = (int)u.id;
                userIds.Add((int)u.id);
            }
            var existingEmails = usersByEmail.Keys.ToHashSet(StringComparer.OrdinalIgnoreCase);
            var existingCodes = usersByCode.Keys.ToHashSet(StringComparer.OrdinalIgnoreCase);

            static string Cell(B r, params string[] keys)
            {
                foreach (var k in keys)
                    if (r.TryGetValue(k, out var v))
                    {
                        var s = v.ValueKind switch
                        {
                            JsonValueKind.String => v.GetString(),
                            JsonValueKind.Number => v.ToString(),
                            JsonValueKind.True => "true",
                            JsonValueKind.False => "false",
                            _ => null
                        };
                        if (!string.IsNullOrWhiteSpace(s)) return s.Trim();
                    }
                return "";
            }
            static int? CellInt(B r, params string[] keys)
            {
                var s = Cell(r, keys);
                return int.TryParse(s, out var n) ? n : (int?)null;
            }
            static bool ValidEmail(string s) =>
                System.Text.RegularExpressions.Regex.IsMatch(s, @"^[^@\s]+@[^@\s]+\.[^@\s]+$");

            var parsed = new List<ImpRow>();
            var seenEmails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var seenCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // ---- pass 1: every field except manager resolvability ----
            for (int i = 0; i < rows.Count; i++)
            {
                var r = rows[i];
                var row = new ImpRow { Index = i + 2 };

                row.Code = Cell(r, "employee_code", "employee code", "code");
                row.Name = Cell(r, "name", "full name");
                row.Email = Cell(r, "email");
                var mobile = Cell(r, "mobile", "phone");
                row.Mobile = mobile.Length > 0 ? mobile : null;
                var desig = Cell(r, "designation", "title");
                row.Desig = desig.Length > 0 ? desig : null;

                if (row.Code.Length == 0) row.Errors.Add("Employee code is required");
                if (row.Name.Length == 0) row.Errors.Add("Name is required");
                if (row.Email.Length == 0) row.Errors.Add("Email is required");
                else if (!ValidEmail(row.Email)) row.Errors.Add("Email format is invalid");

                if (row.Email.Length > 0)
                {
                    if (existingEmails.Contains(row.Email)) row.Errors.Add("A user with this email already exists");
                    else if (!seenEmails.Add(row.Email)) row.Errors.Add("Duplicate email within the file");
                }
                if (row.Code.Length > 0)
                {
                    if (existingCodes.Contains(row.Code)) row.Errors.Add("A user with this employee code already exists");
                    else if (!seenCodes.Add(row.Code)) row.Errors.Add("Duplicate employee code within the file");
                }

                // role — accept role_id or role name; required (same as the manual dropdown)
                var roleIdRaw = CellInt(r, "role_id");
                var roleName = Cell(r, "role", "role_name", "access level");
                if (roleIdRaw is int rid) { if (roleIds.Contains(rid)) { row.RoleId = rid; row.RoleDisplay = $"#{rid}"; } else row.Errors.Add($"Unknown role_id {rid}"); }
                else if (roleName.Length > 0) { if (roleByName.TryGetValue(roleName, out var r2)) { row.RoleId = r2; row.RoleDisplay = roleName; } else row.Errors.Add($"Unknown role '{roleName}'"); }
                else row.Errors.Add("Role is required");

                // department — accept department_id or name; optional
                var deptIdRaw = CellInt(r, "department_id");
                var deptName = Cell(r, "department", "department_name");
                if (deptIdRaw is int did) { if (deptIds.Contains(did)) { row.DeptId = did; row.DeptDisplay = $"#{did}"; } else row.Errors.Add($"Unknown department_id {did}"); }
                else if (deptName.Length > 0) { if (deptByName.TryGetValue(deptName, out var d2)) { row.DeptId = d2; row.DeptDisplay = deptName; } else row.Errors.Add($"Unknown department '{deptName}'"); }

                // division — accept division_id or name; optional
                var divIdRaw = CellInt(r, "division_id");
                var divName = Cell(r, "division");
                if (divIdRaw is int vid2) { if (divIds.Contains(vid2)) row.DivId = vid2; else row.Errors.Add($"Unknown division_id {vid2}"); }
                else if (divName.Length > 0) { if (divByName.TryGetValue(divName, out var v2)) row.DivId = v2; else row.Errors.Add($"Unknown division '{divName}'"); }

                var capStr = Cell(r, "weekly_capacity_hours", "capacity", "weekly capacity");
                if (capStr.Length > 0)
                {
                    if (decimal.TryParse(capStr, out var cap)) row.Cap = cap;
                    else row.Errors.Add("Weekly capacity must be a number");
                }

                var statusStr = Cell(r, "status");
                if (statusStr.Length > 0)
                {
                    if (statusStr.Equals("Active", StringComparison.OrdinalIgnoreCase)) row.Status = "Active";
                    else if (statusStr.Equals("Inactive", StringComparison.OrdinalIgnoreCase)) row.Status = "Inactive";
                    else row.Errors.Add("Status must be Active or Inactive");
                }

                row.Pw = Cell(r, "password", "temporary_password", "temporary password");
                if (row.Pw.Length == 0) row.Errors.Add("Password is required");
                else if (row.Pw.Length < 8) row.Errors.Add("Password needs at least 8 characters");

                // manager / "Reports to" reference — resolved in pass 2. Priority id, code, email.
                var mgrIdRaw = CellInt(r, "manager_id");
                var mgrCode = Cell(r, "manager_employee_code", "manager_code", "manager code", "reports_to_code");
                var mgrEmail = Cell(r, "manager_email", "manager email", "manager", "reports_to", "reports to");
                if (mgrIdRaw is int mid) { row.MgrKind = "id"; row.MgrVal = mid.ToString(); row.MgrDisplay = $"#{mid}"; }
                else if (mgrCode.Length > 0) { row.MgrKind = "code"; row.MgrVal = mgrCode; row.MgrDisplay = mgrCode; }
                else if (mgrEmail.Length > 0) { row.MgrKind = "email"; row.MgrVal = mgrEmail; row.MgrDisplay = mgrEmail; }

                row.BaseValid = row.Errors.Count == 0;
                parsed.Add(row);
            }

            // identities available inside this file (from otherwise-valid rows), so a
            // "Reports to" manager who is also being created here resolves too.
            var batchCodes = parsed.Where(p => p.BaseValid).Select(p => p.Code).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var batchEmails = parsed.Where(p => p.BaseValid).Select(p => p.Email).ToHashSet(StringComparer.OrdinalIgnoreCase);

            // ---- pass 2: resolve managers against existing users, else this file ----
            foreach (var row in parsed.Where(p => p.BaseValid))
            {
                switch (row.MgrKind)
                {
                    case "id":
                        var mid = int.Parse(row.MgrVal);
                        if (userIds.Contains(mid)) row.MgrId = mid;
                        else row.Errors.Add($"manager_id {mid} does not exist");
                        break;
                    case "code":
                        if (usersByCode.TryGetValue(row.MgrVal, out var c1)) row.MgrId = c1;
                        else if (batchCodes.Contains(row.MgrVal)) row.MgrDeferred = true;
                        else row.Errors.Add($"Manager '{row.MgrVal}' not found in the database or this file");
                        break;
                    case "email":
                        if (usersByEmail.TryGetValue(row.MgrVal, out var e1)) row.MgrId = e1;
                        else if (batchEmails.Contains(row.MgrVal)) row.MgrDeferred = true;
                        else row.Errors.Add($"Manager '{row.MgrVal}' not found in the database or this file");
                        break;
                }
            }

            List<object> Results_() => parsed.Select(p => (object)new
            {
                row = p.Index, employee_code = p.Code, name = p.Name, email = p.Email,
                role = p.RoleDisplay, department = p.DeptDisplay, reports_to = p.MgrDisplay,
                status = p.Status, valid = p.Valid, errors = p.Errors
            }).ToList();

            var validRows = parsed.Where(p => p.Valid).ToList();
            var invalidCount = parsed.Count - validRows.Count;

            if (!commit)
                return Results.Json(new { commit = false, total = rows.Count, valid = validRows.Count, invalid = invalidCount, rows = Results_() });

            var created = 0;
            if (validRows.Count > 0)
                await db.Tx<int>(async (conn, tx) =>
                {
                    // phase 1: insert every valid row (manager set when it already exists).
                    var newByCode = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                    var newByEmail = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                    foreach (var u in validRows)
                    {
                        u.NewId = await conn.ExecuteScalarAsync<int>("""
                            INSERT INTO users (employee_code, name, email, mobile, password_hash, department_id,
                                               division_id, designation, manager_id, role_id, weekly_capacity_hours,
                                               status, must_change_password)
                            VALUES (@code, @name, @email, @mobile, @hash, @dept, @div, @desig, @mgr, @role, @cap, @status, 1)
                            RETURNING id
                            """, new
                        {
                            code = u.Code, name = u.Name, email = u.Email, mobile = u.Mobile,
                            hash = Passwords.Hash(u.Pw),
                            dept = u.DeptId, div = u.DivId, desig = u.Desig, mgr = u.MgrId,
                            role = u.RoleId, cap = u.Cap, status = u.Status
                        }, tx);
                        newByCode[u.Code] = u.NewId;
                        newByEmail[u.Email] = u.NewId;
                        created++;
                    }

                    // phase 2: link managers that were themselves created in this file.
                    foreach (var u in validRows.Where(x => x.MgrDeferred))
                    {
                        int? mgr = u.MgrKind == "code"
                            ? (newByCode.TryGetValue(u.MgrVal, out var a) ? a : usersByCode.TryGetValue(u.MgrVal, out var b2) ? b2 : (int?)null)
                            : (newByEmail.TryGetValue(u.MgrVal, out var c) ? c : usersByEmail.TryGetValue(u.MgrVal, out var d3) ? d3 : (int?)null);
                        if (mgr is int m)
                            await conn.ExecuteAsync("UPDATE users SET manager_id = @m WHERE id = @id", new { m, id = u.NewId }, tx);
                    }
                    return 0;
                });

            await Audit.LogActivity(db, ctx, "user", 0, "imported",
                $"Bulk import: {created} user(s) created, {invalidCount} row(s) failed validation");
            return Results.Json(new { commit = true, total = rows.Count, created, failed = invalidCount, rows = Results_() });
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
            var u = (CurrentUser)ctx.Items["user"]!;
            u.RequireLevel(2);              // Masters module: Level 1 & 2 only
            u.Require("users.view");
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
            if (id == me.Id) throw AppException.Conflict("You cannot deactivate your own account");

            var row = await db.One("""
                SELECT (SELECT COUNT(*) FROM roles r JOIN users u ON u.role_id = r.id
                         WHERE r.level = 1 AND u.status = 'Active' AND u.id <> @id) AS other_admins,
                       (SELECT level FROM roles r JOIN users u ON u.role_id = r.id
                         WHERE u.id = @id) AS level,
                       (SELECT name FROM users WHERE id = @id) AS name,
                       (SELECT status FROM users WHERE id = @id) AS status
                """, new { id }) ?? throw AppException.NotFound();
            if (row.level is null) throw AppException.NotFound();
            if (Convert.ToInt32(row.level) == 1 && Convert.ToInt64(row.other_admins) == 0)
                throw AppException.Conflict("This is the last active Super Admin");

            // Soft delete: the record and every historical relationship
            // (assignments, accounts, opportunities, meetings, ownership, audit
            // trail) are left completely untouched — the account is simply flagged
            // Inactive. Inactive users cannot log in (checked at /api/auth/login)
            // and cannot be picked for new assignments (AssignableIds filters
            // status = 'Active'). A Super Admin can reactivate them at any time.
            if ((string)row.status != "Inactive")
            {
                await db.Exec("UPDATE users SET status = 'Inactive' WHERE id = @id", new { id });
                await Audit.LogActivity(db, ctx, "user", id, "deactivated",
                    $"User {row.name} set to Inactive; record and history preserved");
                await Audit.Notify(db, id, "Account", "Account deactivated",
                    "Your account has been set to inactive. Contact a Super Admin if this is unexpected.",
                    "user", id, me.Id);
            }
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
            var mu = (CurrentUser)ctx.Items["user"]!;
            mu.RequireLevel(2);              // Masters module: Level 1 & 2 only
            mu.Require("masters.create");
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

        /* ---------------------------------------------------------------------
           Bulk import for departments. Uses the same three department fields
           (code, name, head) and the same rules as the manual Add-department
           form: the name is required and must be unique (the departments table's
           only uniqueness rule); code is optional (max 12 chars); head is
           optional and resolved to head_user_id. Rows are validated first — only
           valid rows are created, inside ONE transaction — and each row is
           reported back with its exact error, mirroring the other modules'
           bulk-import pattern. Same authorisation as the manual create.
           -------------------------------------------------------------------- */
        app.MapPost("/api/masters/departments/import", async (HttpContext ctx, Db db, B b) =>
        {
            var mu = (CurrentUser)ctx.Items["user"]!;
            mu.RequireLevel(2);
            mu.Require("masters.create");

            var commit = b.Bool("commit");
            var rows = b.ObjArray("rows");
            if (rows.Count == 0) throw AppException.BadRequest("The file has no rows to import");
            if (rows.Count > 1000) throw AppException.BadRequest("Please import at most 1000 rows at a time");

            // The name-unique rule matches the DB constraint (case-sensitive).
            var existingNames = (await db.Q("SELECT name FROM departments"))
                .Select(r => (string)r.name).ToHashSet(StringComparer.Ordinal);
            var usersByEmail = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var usersByCode = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var userIds = new HashSet<int>();
            foreach (var u in await db.Q("SELECT id, email, employee_code FROM users"))
            {
                usersByEmail[(string)u.email] = (int)u.id;
                usersByCode[(string)u.employee_code] = (int)u.id;
                userIds.Add((int)u.id);
            }

            static string Cell(B r, params string[] keys)
            {
                foreach (var k in keys)
                    if (r.TryGetValue(k, out var v))
                    {
                        var s = v.ValueKind switch
                        {
                            JsonValueKind.String => v.GetString(),
                            JsonValueKind.Number => v.ToString(),
                            _ => null
                        };
                        if (!string.IsNullOrWhiteSpace(s)) return s.Trim();
                    }
                return "";
            }
            static int? CellInt(B r, params string[] keys)
            {
                var s = Cell(r, keys);
                return int.TryParse(s, out var n) ? n : (int?)null;
            }

            var results = new List<object>();
            var toInsert = new List<(string? code, string name, int? head)>();
            var seenNames = new HashSet<string>(StringComparer.Ordinal);

            for (int i = 0; i < rows.Count; i++)
            {
                var r = rows[i];
                var errors = new List<string>();

                var code = Cell(r, "code", "department_code");
                var name = Cell(r, "name", "department", "department_name");

                if (name.Length == 0) errors.Add("Name is required");
                else if (name.Length > 80) errors.Add("Name must be 80 characters or fewer");
                else
                {
                    if (existingNames.Contains(name)) errors.Add("A department with this name already exists");
                    else if (!seenNames.Add(name)) errors.Add("Duplicate name within the file");
                }
                if (code.Length > 12) errors.Add("Code must be 12 characters or fewer");

                // head (optional) — accept head_user_id, head_employee_code, or head_email.
                int? head = null;
                var headIdRaw = CellInt(r, "head_user_id");
                var headCode = Cell(r, "head_employee_code", "head_code");
                var headEmail = Cell(r, "head_email", "head");
                if (headIdRaw is int hid) { if (userIds.Contains(hid)) head = hid; else errors.Add($"head_user_id {hid} does not exist"); }
                else if (headCode.Length > 0) { if (usersByCode.TryGetValue(headCode, out var h1)) head = h1; else errors.Add($"Head '{headCode}' not found"); }
                else if (headEmail.Length > 0) { if (usersByEmail.TryGetValue(headEmail, out var h2)) head = h2; else errors.Add($"Head '{headEmail}' not found"); }

                var valid = errors.Count == 0;
                if (valid) toInsert.Add((code.Length > 0 ? code : null, name, head));
                results.Add(new { row = i + 2, code, name, valid, errors });
            }

            var validCount = toInsert.Count;
            var invalidCount = rows.Count - validCount;

            if (!commit)
                return Results.Json(new { commit = false, total = rows.Count, valid = validCount, invalid = invalidCount, rows = results });

            var created = 0;
            if (validCount > 0)
                await db.Tx<int>(async (conn, tx) =>
                {
                    foreach (var d in toInsert)
                    {
                        await conn.ExecuteAsync(
                            "INSERT INTO departments (code, name, head_user_id) VALUES (@code, @name, @head)",
                            new { d.code, d.name, head = d.head }, tx);
                        created++;
                    }
                    return 0;
                });

            await Audit.LogActivity(db, ctx, "departments", 0, "imported",
                $"Bulk import: {created} department(s) created, {invalidCount} row(s) failed validation");
            return Results.Json(new { commit = true, total = rows.Count, created, failed = invalidCount, rows = results });
        });

        app.MapPut("/api/masters/{master}/{id:int}", async (HttpContext ctx, Db db, string master, int id, B b) =>
        {
            var mu = (CurrentUser)ctx.Items["user"]!;
            mu.RequireLevel(2);              // Masters module: Level 1 & 2 only
            mu.Require("masters.edit");
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
            var mu = (CurrentUser)ctx.Items["user"]!;
            mu.RequireLevel(2);              // Masters module: Level 1 & 2 only
            mu.Require("masters.edit");
            var m = Find(master);
            await db.Exec($"UPDATE {m.Table} SET is_active = @a WHERE id = @id",
                new { a = b.Bool("active") ? 1 : 0, id });
            return Results.Json(new { ok = true });
        });

        /* Deleting is refused while anything still points at it, and says how much. */
        app.MapDelete("/api/masters/{master}/{id:int}", async (HttpContext ctx, Db db, string master, int id) =>
        {
            var mu = (CurrentUser)ctx.Items["user"]!;
            mu.RequireLevel(2);              // Masters module: Level 1 & 2 only
            mu.Require("masters.delete");
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
