/* =====================================================================
   SMTP mailer. Sends transactional email (password reset). Configured
   under the "Smtp" section; port 465 uses implicit SSL, anything else
   uses STARTTLS. Falls back to no-op logging when not configured so the
   app still runs in development without a mail server.
   ===================================================================== */
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

namespace AshikaWdm.Infrastructure;

public sealed class Mailer(IConfiguration cfg, ILogger<Mailer> log)
{
    private readonly string _host = cfg["Smtp:Host"] ?? "";
    private readonly int _port = int.TryParse(cfg["Smtp:Port"], out var p) ? p : 465;
    private readonly string _user = cfg["Smtp:Username"] ?? "";
    private readonly string _pass = cfg["Smtp:Password"] ?? "";
    private readonly string _from = cfg["Smtp:From"] ?? "no-reply@ashikagroup.com";
    private readonly string _fromName = cfg["Smtp:FromName"] ?? "Ashika WDM";

    public bool Configured => !string.IsNullOrWhiteSpace(_host) && !string.IsNullOrWhiteSpace(_user);

    public async Task SendAsync(string toEmail, string subject, string htmlBody)
    {
        if (!Configured)
        {
            log.LogWarning("SMTP not configured — email to {To} ('{Subject}') was not sent", toEmail, subject);
            return;
        }

        var msg = new MimeMessage();
        msg.From.Add(new MailboxAddress(_fromName, _from));
        msg.To.Add(MailboxAddress.Parse(toEmail));
        msg.Subject = subject;
        msg.Body = new BodyBuilder { HtmlBody = htmlBody }.ToMessageBody();

        using var client = new SmtpClient();
        var security = _port == 465 ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTls;
        await client.ConnectAsync(_host, _port, security);
        await client.AuthenticateAsync(_user, _pass);
        await client.SendAsync(msg);
        await client.DisconnectAsync(true);
        log.LogInformation("Sent '{Subject}' to {To}", subject, toEmail);
    }
}
