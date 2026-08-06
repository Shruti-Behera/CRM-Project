/* =====================================================================
   The plumbing every endpoint stands on: the database helpers, the error
   type the handler understands, password hashing, tokens, the signed-in
   user, and the audit writers. A direct port of the Node server's db.js,
   lib/ and middleware/ — same behaviour, same rules.
   ===================================================================== */
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Dapper;
using Microsoft.IdentityModel.Tokens;
using Npgsql;

namespace AshikaWdm.Infrastructure;

/* ------------------------------------------------------------- errors */
public sealed class AppException(int status, string message, object? details = null) : Exception(message)
{
    public int Status { get; } = status;
    public object? Details { get; } = details;

    public static AppException BadRequest(string m, object? d = null) => new(400, m, d);
    public static AppException Unauthorised(string m = "Sign in first") => new(401, m);
    public static AppException Forbidden(string m = "You do not have rights to do that") => new(403, m);
    public static AppException NotFound(string m = "Not found") => new(404, m);
    public static AppException Conflict(string m) => new(409, m);
}

/* ----------------------------------------------------------- database */
public sealed class Db(NpgsqlDataSource source)
{
    public NpgsqlDataSource Source { get; } = source;

    public async Task<IEnumerable<dynamic>> Q(string sql, object? p = null)
    {
        await using var conn = await Source.OpenConnectionAsync();
        return await conn.QueryAsync(sql, p);
    }

    public async Task<dynamic?> One(string sql, object? p = null)
    {
        await using var conn = await Source.OpenConnectionAsync();
        return await conn.QueryFirstOrDefaultAsync(sql, p);
    }

    public async Task<T?> Scalar<T>(string sql, object? p = null)
    {
        await using var conn = await Source.OpenConnectionAsync();
        return await conn.ExecuteScalarAsync<T>(sql, p);
    }

    public async Task<int> Exec(string sql, object? p = null)
    {
        await using var conn = await Source.OpenConnectionAsync();
        return await conn.ExecuteAsync(sql, p);
    }

    /// <summary>Anything touching two tables belongs in here.</summary>
    public async Task<T> Tx<T>(Func<NpgsqlConnection, NpgsqlTransaction, Task<T>> fn)
    {
        await using var conn = await Source.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();
        try
        {
            var result = await fn(conn, tx);
            await tx.CommitAsync();
            return result;
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
    }

    /// <summary>
    /// Document numbers — ACC-0001, OPP-2026-0001 and so on. Taken inside the
    /// caller's transaction with the row locked, because two people pressing
    /// Create at the same moment must not be handed the same number.
    /// </summary>
    public static async Task<string> NextNo(NpgsqlConnection conn, NpgsqlTransaction tx,
        string table, string column, string prefix, int width = 4, bool fyPrefix = false)
    {
        var now = DateTime.Now;
        var year = now.Month >= 4 ? now.Year + 1 : now.Year;   // Indian financial year
        var like = fyPrefix ? $"{prefix}-{year}-%" : $"{prefix}-%";
        var last = await conn.ExecuteScalarAsync<string?>(
            $"SELECT {column} FROM {table} WHERE {column} LIKE @like ORDER BY {column} DESC LIMIT 1 FOR UPDATE",
            new { like }, tx);
        var n = last is null ? 1 : int.Parse(last[^width..]) + 1;
        return fyPrefix
            ? $"{prefix}-{year}-{n.ToString().PadLeft(width, '0')}"
            : $"{prefix}-{n.ToString().PadLeft(width, '0')}";
    }
}

/* ---------------------------------------------------------- passwords */
/* PBKDF2-SHA256 from the base class library — no extra dependency, and a
   format that says what it is so the parameters can be raised later.   */
public static class Passwords
{
    private const int Iterations = 210_000;
    private const int SaltBytes = 16;
    private const int HashBytes = 32;

    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltBytes);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, HashBytes);
        return $"pbkdf2-sha256${Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    public static bool Verify(string password, string stored)
    {
        try
        {
            var parts = stored.Split('$');
            if (parts.Length != 4 || parts[0] != "pbkdf2-sha256") return false;
            var iterations = int.Parse(parts[1]);
            var salt = Convert.FromBase64String(parts[2]);
            var expected = Convert.FromBase64String(parts[3]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations,
                HashAlgorithmName.SHA256, expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch { return false; }
    }

    /* Verified against when the account does not exist, so a wrong address
       and a wrong password take the same time to answer. */
    public static readonly string Dummy = Hash(Guid.NewGuid().ToString());
}

/* ------------------------------------------------------------- tokens */
public sealed class Tokens(IConfiguration cfg)
{
    private readonly string _secret = cfg["Jwt:Secret"]
        ?? throw new InvalidOperationException("Jwt:Secret is not configured");
    private readonly int _hours = int.TryParse(cfg["Jwt:ExpiryHours"], out var h) ? h : 8;

    public string Issue(int userId)
    {
        var key = new SymmetricSecurityKey(SHA256.HashData(Encoding.UTF8.GetBytes(_secret)));
        var token = new JwtSecurityToken(
            claims: [new Claim("sub", userId.ToString())],
            expires: DateTime.UtcNow.AddHours(_hours),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public int? Validate(string token)
    {
        try
        {
            var key = new SymmetricSecurityKey(SHA256.HashData(Encoding.UTF8.GetBytes(_secret)));
            var principal = new JwtSecurityTokenHandler().ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuer = false,
                ValidateAudience = false,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = key,
                ClockSkew = TimeSpan.FromMinutes(1)
            }, out _);
            var sub = principal.FindFirstValue("sub") ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
            return sub is null ? null : int.Parse(sub);
        }
        catch { return null; }
    }
}

/* -------------------------------------------------- the signed-in user */
public sealed class CurrentUser
{
    public int Id { get; init; }
    public string EmployeeCode { get; init; } = "";
    public string Name { get; init; } = "";
    public string Email { get; init; } = "";
    public int Level { get; init; }
    public string ScopeKind { get; init; } = "own";     // all | team | own
    public int? DepartmentId { get; init; }
    public int? DivisionId { get; init; }
    public string? Department { get; init; }
    public string? Division { get; init; }
    public HashSet<string> Permissions { get; init; } = [];
    public int[]? People { get; set; }                  // the reporting tree, null when scope is 'all'

    public bool Can(string slug) => Permissions.Contains(slug);
    public void Require(string slug)
    {
        if (!Can(slug)) throw AppException.Forbidden($"You need the {slug} right");
    }
    public void RequireSuperAdmin()
    {
        if (Level != 1) throw AppException.Forbidden("Only a Super Admin can do that");
    }
}

/* A WHERE fragment plus the parameters it needs, merged into the query's own. */
public sealed record ScopeSql(string Sql, int[] People, int? DivisionId, int? DepartmentId, int UserId);

/// <summary>
/// Who a person can see, expressed once so every list obeys the same rule.
/// Driven by the role's scope (all | team | own), not by the level number, so
/// re-tiering the hierarchy never changes visibility on its own:
///   scope 'all'    Super Admin, Management, Head / HOD  — every record
///   scope 'team'   Manager     — own department or division, plus their reporting line
///   scope 'own'    Executive   — only what they own, support or watch
/// The reporting tree walks downwards, so a manager keeps sight of their own
/// people even when the work sits in another division.
/// </summary>
public static class Scope
{
    public static async Task<CurrentUser> Load(Db db, int userId)
    {
        var u = await db.One("""
            SELECT u.id, u.employee_code, u.name, u.email, u.status,
                   u.department_id, u.division_id,
                   r.level, r.scope, d.name AS department, dv.name AS division
              FROM users u
              JOIN roles r ON r.id = u.role_id
              LEFT JOIN departments d ON d.id = u.department_id
              LEFT JOIN divisions dv ON dv.id = u.division_id
             WHERE u.id = @userId
            """, new { userId }) ?? throw AppException.Unauthorised("That account no longer exists");

        if ((string)u.status != "Active") throw AppException.Forbidden("This account is inactive");

        /* The role's defaults with any per-user override applied on top —
           the same rule the prototype used. The ::integer cast on up.granted
           keeps this correct whether the column is stored as smallint or as a
           real boolean, so COALESCE never trips PostgreSQL's strict typing. */
        var perms = await db.Q("""
            SELECT p.slug, COALESCE(up.granted::integer, 1) AS granted
              FROM permissions p
              LEFT JOIN role_permissions rp
                     ON rp.permission_id = p.id
                    AND rp.role_id = (SELECT role_id FROM users WHERE id = @userId)
              LEFT JOIN user_permissions up
                     ON up.permission_id = p.id AND up.user_id = @userId
             WHERE rp.permission_id IS NOT NULL OR up.user_id IS NOT NULL
            """, new { userId });

        var user = new CurrentUser
        {
            Id = (int)u.id,
            EmployeeCode = (string)u.employee_code,
            Name = (string)u.name,
            Email = (string)u.email,
            Level = Convert.ToInt32(u.level),
            ScopeKind = (string)u.scope,
            DepartmentId = (int?)u.department_id,
            DivisionId = (int?)u.division_id,
            Department = (string?)u.department,
            Division = (string?)u.division,
            Permissions = perms.Where(p => Convert.ToInt32(p.granted) == 1)
                               .Select(p => (string)p.slug).ToHashSet()
        };

        if (user.ScopeKind != "all")
        {
            var ids = await db.Q("""
                WITH RECURSIVE tree AS (
                  SELECT id FROM users WHERE id = @userId
                  UNION
                  SELECT u.id FROM users u JOIN tree t ON u.manager_id = t.id
                )
                SELECT id FROM tree
                """, new { userId });
            user.People = ids.Select(r => (int)r.id).ToArray();
        }
        return user;
    }

    /* Npgsql cannot bind a null array, so @people is always handed a concrete
       int[] — empty when the scope does not read it. The empty array changes
       nothing: '= ANY('{}')' is simply never true, and the 'all'/'own' branches
       do not reference @people at all. */
    public static ScopeSql Banking(CurrentUser u, string alias = "o") => u.ScopeKind switch
    {
        "all" => new("1=1", Array.Empty<int>(), null, null, u.Id),
        "team" => new($"""
            ({alias}.owner_id = ANY(@people)
              OR (CAST(@divId AS int) IS NOT NULL AND {alias}.division_id = @divId)
              OR EXISTS (SELECT 1 FROM opportunity_team ot
                          WHERE ot.opportunity_id = {alias}.id AND ot.user_id = ANY(@people)))
            """, u.People ?? Array.Empty<int>(), u.DivisionId, null, u.Id),
        _ => new($"""
            ({alias}.owner_id = @uid
              OR EXISTS (SELECT 1 FROM opportunity_team ot
                          WHERE ot.opportunity_id = {alias}.id AND ot.user_id = @uid))
            """, Array.Empty<int>(), null, null, u.Id)
    };

    public static ScopeSql Institution(CurrentUser u, string alias = "i") => u.ScopeKind switch
    {
        "all" => new("1=1", Array.Empty<int>(), null, null, u.Id),
        "team" => new($"{alias}.rm_id = ANY(@people)", u.People ?? Array.Empty<int>(), null, null, u.Id),
        _ => new($"{alias}.rm_id = @uid", Array.Empty<int>(), null, null, u.Id)
    };

    /// <summary>
    /// Assignment visibility, strictly by the reporting tree (users.manager_id):
    ///   scope 'all'    Super Admin              — every assignment
    ///   scope 'team'   Management/Head/Manager  — their own assignments plus every
    ///                  assignment owned by someone in their downward reporting tree.
    ///                  The tree (u.People) is self + all direct/indirect reports, so
    ///                  a manager never sees work owned by anyone ABOVE them.
    ///   scope 'own'    Executive                — only their own assignments.
    /// Watchers are an explicit, deliberate share and are honoured on top of the
    /// hierarchy at every level, so a person always sees an assignment they were
    /// added to watch. Department, division and assigned_by no longer widen sight —
    /// visibility follows the manager_id chain alone, as required.
    /// </summary>
    public static ScopeSql Assignment(CurrentUser u, string alias = "a") => u.ScopeKind switch
    {
        "all" => new("1=1", Array.Empty<int>(), null, null, u.Id),
        "team" => new($"""
            ({alias}.assigned_to = ANY(@people)
              OR EXISTS (SELECT 1 FROM assignment_watchers w
                          WHERE w.assignment_id = {alias}.id AND w.user_id = @uid))
            """, u.People ?? Array.Empty<int>(), null, u.DepartmentId, u.Id),
        _ => new($"""
            ({alias}.assigned_to = @uid
              OR EXISTS (SELECT 1 FROM assignment_watchers w
                          WHERE w.assignment_id = {alias}.id AND w.user_id = @uid))
            """, Array.Empty<int>(), null, null, u.Id)
    };
}

/* -------------------------------------------------------------- audit */
public static class Audit
{
    public static Task LogActivity(Db db, HttpContext ctx, string entityType, long entityId,
        string action, string description, string? oldV = null, string? newV = null) =>
        db.Exec("""
            INSERT INTO activity_logs
              (entity_type, entity_id, user_id, action, description, old_value, new_value, ip_address)
            VALUES (@entityType, @entityId, @userId, @action, @description, @oldV, @newV, @ip)
            """,
            new
            {
                entityType,
                entityId,
                userId = (ctx.Items["user"] as CurrentUser)?.Id,
                action,
                description,
                oldV,
                newV,
                ip = ctx.Connection.RemoteIpAddress?.ToString()
            });

    /* Fired with the recipient's user id right after a notification row is
       written, so the real-time layer can push it to that user's live
       connections. Wired up in Program.cs. Existing call sites are unchanged. */
    public static Action<int>? NotifyHook;

    public static async Task Notify(Db db, int? userId, string type, string title, string message,
        string? entityType = null, long? entityId = null, int? senderId = null)
    {
        if (userId is null) return;
        await db.Exec("""
            INSERT INTO notifications (user_id, sender_id, type, title, message, entity_type, entity_id)
            VALUES (@userId, @senderId, @type, @title, @message, @entityType, @entityId)
            """, new { userId, senderId, type, title, message, entityType, entityId });
        try { NotifyHook?.Invoke(userId.Value); } catch { /* a push failure must never break the request */ }
    }
}

/* ----------------------------------------------- request-body reading */
public static class Body
{
    /// <summary>Required string — 400 with the field named when missing or blank.</summary>
    public static string Str(this Dictionary<string, System.Text.Json.JsonElement> b, string key)
    {
        var v = b.OptStr(key);
        return string.IsNullOrWhiteSpace(v)
            ? throw AppException.BadRequest($"{key} is needed") : v!;
    }

    /* An empty string behaves like a missing value, the way `|| null` did in
       the Node server — so an optional date sent as "" becomes NULL, not a
       failed cast. */
    public static string? OptStr(this Dictionary<string, System.Text.Json.JsonElement> b, string key) =>
        b.TryGetValue(key, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.String
           && !string.IsNullOrWhiteSpace(v.GetString())
            ? v.GetString() : null;

    public static int Int(this Dictionary<string, System.Text.Json.JsonElement> b, string key) =>
        b.OptInt(key) ?? throw AppException.BadRequest($"{key} is needed");

    public static int? OptInt(this Dictionary<string, System.Text.Json.JsonElement> b, string key) =>
        b.TryGetValue(key, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.Number
            ? v.GetInt32() : null;

    public static decimal Dec(this Dictionary<string, System.Text.Json.JsonElement> b, string key, decimal fallback = 0) =>
        b.TryGetValue(key, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.Number
            ? v.GetDecimal() : fallback;

    public static bool Bool(this Dictionary<string, System.Text.Json.JsonElement> b, string key, bool fallback = false) =>
        b.TryGetValue(key, out var v)
            ? v.ValueKind == System.Text.Json.JsonValueKind.True : fallback;

    public static int[] IntArray(this Dictionary<string, System.Text.Json.JsonElement> b, string key) =>
        b.TryGetValue(key, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.Array
            ? v.EnumerateArray().Where(x => x.ValueKind == System.Text.Json.JsonValueKind.Number)
               .Select(x => x.GetInt32()).ToArray()
            : [];

    public static string[] StrArray(this Dictionary<string, System.Text.Json.JsonElement> b, string key) =>
        b.TryGetValue(key, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.Array
            ? v.EnumerateArray().Where(x => x.ValueKind == System.Text.Json.JsonValueKind.String)
               .Select(x => x.GetString()!).ToArray()
            : [];

    public static List<Dictionary<string, System.Text.Json.JsonElement>> ObjArray(
        this Dictionary<string, System.Text.Json.JsonElement> b, string key) =>
        b.TryGetValue(key, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.Array
            ? v.EnumerateArray().Where(x => x.ValueKind == System.Text.Json.JsonValueKind.Object)
               .Select(x => x.Deserialize<Dictionary<string, System.Text.Json.JsonElement>>()!)
               .ToList()
            : [];

    public static string Choice(this Dictionary<string, System.Text.Json.JsonElement> b,
        string key, string[] allowed, string fallback)
    {
        var v = b.OptStr(key) ?? fallback;
        return allowed.Contains(v) ? v
            : throw AppException.BadRequest($"{key} must be one of: {string.Join(", ", allowed)}");
    }
}
