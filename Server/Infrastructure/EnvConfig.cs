/* =====================================================================
   Environment configuration — one code path, two environments.

   The database connection (and other secrets) come only from environment
   variables, loaded from a local ".env" file during development and from the
   real process environment on the Ubuntu/production server. Nothing is
   hardcoded, so the same build runs locally and in production unchanged.

   Resolution order for the DB connection string:
     1. DB_HOST + DB_NAME present  -> assemble from DB_* parts (preferred; the
        shape the .env.example documents). Handles password special characters
        safely via NpgsqlConnectionStringBuilder.
     2. ConnectionStrings__Db (env) or ConnectionStrings:Db (appsettings) -> use
        the full connection string as-is.
     3. otherwise -> a clear, actionable error.
   ===================================================================== */
using Microsoft.Extensions.Configuration;
using Npgsql;

namespace AshikaWdm.Infrastructure;

public static class DotEnv
{
    /// <summary>
    /// Load a ".env" file into the process environment. Real environment
    /// variables always win (so production values set by systemd/Docker/the OS
    /// are never overwritten), which means the same code uses local values from
    /// .env on a dev machine and the server's own variables in production.
    /// </summary>
    public static void Load()
    {
        foreach (var path in CandidatePaths())
        {
            if (!File.Exists(path)) continue;
            foreach (var raw in File.ReadAllLines(path))
            {
                var line = raw.Trim();
                if (line.Length == 0 || line.StartsWith('#')) continue;
                var eq = line.IndexOf('=');
                if (eq <= 0) continue;
                var key = line[..eq].Trim();
                var val = line[(eq + 1)..].Trim();
                if (val.Length >= 2 && ((val[0] == '"' && val[^1] == '"') || (val[0] == '\'' && val[^1] == '\'')))
                    val = val[1..^1];
                // Real environment variables take precedence over the .env file.
                if (Environment.GetEnvironmentVariable(key) is null)
                    Environment.SetEnvironmentVariable(key, val);
            }
            return; // first .env found wins
        }
    }

    private static IEnumerable<string> CandidatePaths()
    {
        yield return Path.Combine(Directory.GetCurrentDirectory(), ".env");
        yield return Path.Combine(AppContext.BaseDirectory, ".env");
        // when running from Server/bin/Debug/netX, also look up at the project root
        yield return Path.Combine(Directory.GetCurrentDirectory(), "..", ".env");
    }
}

public static class AppConfig
{
    public static string DbConnectionString(IConfiguration cfg)
    {
        var host = Environment.GetEnvironmentVariable("DB_HOST");
        var name = Environment.GetEnvironmentVariable("DB_NAME");

        if (!string.IsNullOrWhiteSpace(host) && !string.IsNullOrWhiteSpace(name))
        {
            var b = new NpgsqlConnectionStringBuilder
            {
                Host = host,
                Port = int.TryParse(Environment.GetEnvironmentVariable("DB_PORT"), out var p) ? p : 5432,
                Database = name,
                Username = Environment.GetEnvironmentVariable("DB_USER") ?? "",
                Password = Environment.GetEnvironmentVariable("DB_PASSWORD") ?? "",
                MaxPoolSize = int.TryParse(Environment.GetEnvironmentVariable("DB_POOL_MAX"), out var mp) ? mp : 10
            };
            var ssl = Environment.GetEnvironmentVariable("DB_SSLMODE");
            if (!string.IsNullOrWhiteSpace(ssl) && Enum.TryParse<SslMode>(ssl, true, out var mode))
                b.SslMode = mode;
            return b.ConnectionString;
        }

        // Full connection string via ConnectionStrings__Db (env) or appsettings.
        var conn = cfg.GetConnectionString("Db");
        if (!string.IsNullOrWhiteSpace(conn)) return conn;

        throw new InvalidOperationException(
            "Database is not configured. Set DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASSWORD " +
            "(see Server/.env.example) — or a full ConnectionStrings__Db value. For local development, " +
            "copy Server/.env.example to Server/.env and fill in your local PostgreSQL details.");
    }
}
