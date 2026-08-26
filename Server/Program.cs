/* =====================================================================
   ASHIKA — Work & Deal Management
   ASP.NET Core 8 + PostgreSQL. One service on one port: the REST API
   under /api, and the compiled React app served alongside it.

   Run modes:
     dotnet run                       the server
     dotnet run -- create-admin       makes or resets the Level 1 user
   ===================================================================== */
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using AshikaWdm.Endpoints;
using AshikaWdm.Infrastructure;
using Npgsql;

if (args.Contains("create-admin"))
{
    await AshikaWdm.Tools.CreateAdmin.Run();
    return;
}

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton(sp =>
    NpgsqlDataSource.Create(builder.Configuration.GetConnectionString("Db")
        ?? throw new InvalidOperationException("ConnectionStrings:Db is not configured")));
builder.Services.AddSingleton<Db>();
builder.Services.AddSingleton<Tokens>();
builder.Services.AddSingleton<Mailer>();
builder.Services.AddSingleton<NotifyStream>();

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = null;      // the client speaks snake_case; leave keys alone
    o.SerializerOptions.PropertyNameCaseInsensitive = true;
});

/* Sign-in is the one endpoint worth throttling: everything else needs a token. */
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(15) }));
});

var corsOrigin = builder.Configuration["Cors:Origin"];
if (!string.IsNullOrEmpty(corsOrigin))
    builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
        p.WithOrigins(corsOrigin.Split(',')).AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

/* Push new notifications to any live SSE connection for the recipient. */
Audit.NotifyHook = uid => app.Services.GetRequiredService<NotifyStream>().Publish(uid);

/* ------------------------------------------------- errors become JSON */
app.Use(async (ctx, next) =>
{
    try { await next(); }
    catch (AppException ex)
    {
        ctx.Response.StatusCode = ex.Status;
        await ctx.Response.WriteAsJsonAsync(new { error = ex.Message, details = ex.Details });
    }
    catch (PostgresException ex) when (ex.SqlState == "23505")
    {
        ctx.Response.StatusCode = 409;
        await ctx.Response.WriteAsJsonAsync(new { error = "That already exists", details = ex.ConstraintName });
    }
    catch (PostgresException ex) when (ex.SqlState == "23503")
    {
        ctx.Response.StatusCode = 409;
        await ctx.Response.WriteAsJsonAsync(new { error = "Something still refers to this, so it cannot be removed" });
    }
    catch (BadHttpRequestException)
    {
        ctx.Response.StatusCode = 400;
        await ctx.Response.WriteAsJsonAsync(new { error = "That does not look right" });
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Unhandled error on {Path}", ctx.Request.Path);
        ctx.Response.StatusCode = 500;
        await ctx.Response.WriteAsJsonAsync(new { error = "Something went wrong at our end" });
    }
});

/* ---------------------------------------------------- security headers */
app.Use(async (ctx, next) =>
{
    var h = ctx.Response.Headers;
    h["X-Content-Type-Options"] = "nosniff";
    h["X-Frame-Options"] = "SAMEORIGIN";
    h["Referrer-Policy"] = "no-referrer";
    h["Content-Security-Policy"] =
        "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; " +
        "script-src 'self'; connect-src 'self'";
    await next();
});

if (!string.IsNullOrEmpty(corsOrigin)) app.UseCors();
app.UseRateLimiter();

/* --------------------------------------- bearer token → CurrentUser */
/* --------------------------------------- bearer token → CurrentUser */
app.Use(async (ctx, next) =>
{
    var path = ctx.Request.Path.Value ?? "";
    var open = path == "/api/health" || path == "/api/auth/login" || path == "/api/auth/forgot"
               || path == "/api/auth/reset" || path == "/api/auth/reset/validate"
               || path == "/api/notifications/stream"   // SSE authenticates via ?access_token
               || !path.StartsWith("/api/");
    if (!open)
    {
        var header = ctx.Request.Headers.Authorization.ToString();
        var token = header.StartsWith("Bearer ") ? header[7..] : null;
        if (token is null) throw AppException.Unauthorised();

        var tokens = ctx.RequestServices.GetRequiredService<Tokens>();
        var userId = tokens.Validate(token)
            ?? throw AppException.Unauthorised("Your session has expired");

        var db = ctx.RequestServices.GetRequiredService<Db>();

        try
        {
            ctx.Items["user"] = await Scope.Load(db, userId);
        }
        catch (Exception ex)
        {
            app.Logger.LogError(ex, "Failed to load user scope for ID {UserId}", userId);
            throw AppException.Unauthorised("Unable to resolve user session permissions");
        }
    }
    await next();
});
var db = app.Services.GetRequiredService<Db>();

app.MapGet("/api/health", async () =>
{
    try { await db.Scalar<int>("SELECT 1"); return Results.Json(new { ok = true, db = "up" }); }
    catch { return Results.Json(new { ok = false, db = "down" }, statusCode: 503); }
});

AuthEndpoints.Map(app);
ShellEndpoints.Map(app);
UserEndpoints.Map(app);
MasterEndpoints.Map(app);
AccountEndpoints.Map(app);
OpportunityEndpoints.Map(app);
MandateEndpoints.Map(app);
InstitutionEndpoints.Map(app);
BrokerageEndpoints.Map(app);
AssignmentEndpoints.Map(app);
WorkApprovalEndpoints.Map(app);
MeetingEndpoints.Map(app);
EmailEndpoints.Map(app);
ResearchReportEndpoints.Map(app);
SettingsEndpoints.Map(app);
AdminEndpoints.Map(app);
DashboardEndpoints.Map(app);
AttachmentEndpoints.Map(app);

/* unknown API routes answer as JSON, not as the SPA page */
app.Map("/api/{**rest}", (HttpContext ctx) =>
    Results.Json(new { error = "No such endpoint", path = ctx.Request.Path.Value }, statusCode: 404));

/* ----------------------------------------------------- the web app */
/* In production the compiled React app sits in wwwroot — one service on
   one port. Without a build the API simply runs on its own (the dev
   setup, where Vite serves the client). */
if (File.Exists(Path.Combine(app.Environment.WebRootPath ?? "wwwroot", "index.html")))
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
    app.MapFallbackToFile("index.html");
    app.Logger.LogInformation("Serving the web app from {Dir}", app.Environment.WebRootPath);
}

app.Logger.LogInformation("Ashika WDM listening");
app.Run();
