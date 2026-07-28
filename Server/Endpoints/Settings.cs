/* =====================================================================
   Administrator settings, stored as key/value rows in the `settings`
   table. Read is available to anyone who can see the admin area; writing
   is Super Admin only.
   ===================================================================== */
using System.Text.Json;
using AshikaWdm.Infrastructure;
using Dapper;

namespace AshikaWdm.Endpoints;

using B = Dictionary<string, JsonElement>;

public static class SettingsEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/api/settings", async (HttpContext ctx, Db db) =>
        {
            ((CurrentUser)ctx.Items["user"]!).Require("users.view");
            var rows = await db.Q("""SELECT "key", "value" FROM settings""");
            var dict = new Dictionary<string, string?>();
            foreach (var r in rows) dict[(string)r.key] = (string?)r.value;
            return Results.Json(dict);
        });

        app.MapPut("/api/settings", async (HttpContext ctx, Db db, B b) =>
        {
            var u = (CurrentUser)ctx.Items["user"]!;
            u.RequireSuperAdmin();

            foreach (var kv in b)
            {
                var val = kv.Value.ValueKind switch
                {
                    JsonValueKind.String => kv.Value.GetString(),
                    JsonValueKind.Null => null,
                    _ => kv.Value.GetRawText()
                };
                await db.Exec("""
                    INSERT INTO settings ("key", "value", updated_by, updated_at)
                    VALUES (@k, @v, @me, NOW())
                    ON CONFLICT ("key") DO UPDATE
                       SET "value" = EXCLUDED."value", updated_by = @me, updated_at = NOW()
                    """, new { k = kv.Key, v = val, me = u.Id });
            }

            await Audit.LogActivity(db, ctx, "settings", 0, "updated", $"{b.Count} setting(s) saved");
            return Results.Json(new { ok = true });
        });
    }
}
