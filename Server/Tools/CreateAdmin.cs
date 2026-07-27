/* =====================================================================
   Creates or resets the first Super Admin.
       dotnet run -- create-admin          (development)
       AshikaWdm.exe create-admin          (on the server)
   Interactive so the password is never in a file, a shell history or
   a repo. Ported from scripts/createAdmin.js.
   ===================================================================== */
using AshikaWdm.Infrastructure;
using Dapper;
using Microsoft.Extensions.Configuration;
using Npgsql;

namespace AshikaWdm.Tools;

public static class CreateAdmin
{
    public static async Task Run()
    {
        var cfg = new ConfigurationBuilder()
            .SetBasePath(AppContext.BaseDirectory)
            .AddJsonFile("appsettings.json")
            .AddJsonFile("appsettings.Production.json", optional: true)
            .AddEnvironmentVariables()
            .Build();

        await using var source = NpgsqlDataSource.Create(
            cfg.GetConnectionString("Db")
            ?? throw new InvalidOperationException("ConnectionStrings:Db is not configured"));
        await using var conn = await source.OpenConnectionAsync();

        try
        {
            var roleId = await conn.ExecuteScalarAsync<int?>("SELECT id FROM roles WHERE level = 1");
            if (roleId is null)
                throw new InvalidOperationException(
                    "Run db/schema.sql and db/seed.sql first — no roles are defined");

            var email = Ask("Email:", "admin@ashika.com");
            var name = Ask("Full name:", "Super Admin");
            var code = Ask("Employee ID:", "EMP-001");
            var password = AskSecret("Password (at least 12 characters):");
            if (password.Length < 12)
                throw new InvalidOperationException("Too short — use at least 12 characters");

            var hash = Passwords.Hash(password);
            var existing = await conn.ExecuteScalarAsync<int?>(
                "SELECT id FROM users WHERE email = @email", new { email });

            if (existing is not null)
            {
                await conn.ExecuteAsync("""
                    UPDATE users SET password_hash = @hash, role_id = @roleId, status = 'Active'
                     WHERE id = @id
                    """, new { hash, roleId, id = existing });
                Console.WriteLine($"\nPassword reset for {email}.");
            }
            else
            {
                var deptId = await conn.ExecuteScalarAsync<int?>(
                    "SELECT id FROM departments ORDER BY id LIMIT 1");
                await conn.ExecuteAsync("""
                    INSERT INTO users (employee_code, name, email, password_hash, department_id,
                                       role_id, designation)
                    VALUES (@code, @name, @email, @hash, @deptId, @roleId, 'System Administrator')
                    """, new { code, name, email, hash, deptId, roleId });
                Console.WriteLine($"\nSuper Admin created: {email}");
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("\n" + ex.Message);
            Environment.ExitCode = 1;
        }
    }

    private static string Ask(string question, string fallback)
    {
        Console.Write($"{question} [{fallback}] ");
        var answer = Console.ReadLine()?.Trim();
        return string.IsNullOrEmpty(answer) ? fallback : answer;
    }

    /* Not perfect concealment — it stops the password appearing over a shoulder. */
    private static string AskSecret(string question)
    {
        Console.Write(question + " ");
        var buf = "";
        while (true)
        {
            var key = Console.ReadKey(intercept: true);
            if (key.Key == ConsoleKey.Enter) { Console.WriteLine(); return buf; }
            if (key.Key == ConsoleKey.Backspace) { if (buf.Length > 0) buf = buf[..^1]; }
            else if (!char.IsControl(key.KeyChar)) buf += key.KeyChar;
        }
    }
}
