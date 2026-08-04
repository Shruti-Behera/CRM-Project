/* =====================================================================
   In-memory fan-out for real-time notifications. Each browser tab / device
   opens a Server-Sent Events connection and subscribes here by user id.
   When a notification row is written (Audit.Notify), Publish(userId) wakes
   every live connection for that user so it can pull the fresh list.

   No external dependency — this is the push channel; the client still reads
   the authoritative data from /api/notifications.
   ===================================================================== */
using System.Collections.Concurrent;
using System.Threading.Channels;

namespace AshikaWdm.Infrastructure;

public sealed class NotifyStream
{
    private readonly ConcurrentDictionary<int, ConcurrentDictionary<Guid, Channel<byte>>> _subs = new();

    public (Guid Id, ChannelReader<byte> Reader) Subscribe(int userId)
    {
        var ch = Channel.CreateUnbounded<byte>(new UnboundedChannelOptions { SingleReader = true });
        var id = Guid.NewGuid();
        _subs.GetOrAdd(userId, _ => new ConcurrentDictionary<Guid, Channel<byte>>()).TryAdd(id, ch);
        return (id, ch.Reader);
    }

    public void Unsubscribe(int userId, Guid id)
    {
        if (_subs.TryGetValue(userId, out var conns))
        {
            conns.TryRemove(id, out _);
            if (conns.IsEmpty) _subs.TryRemove(userId, out _);
        }
    }

    public void Publish(int userId)
    {
        if (_subs.TryGetValue(userId, out var conns))
            foreach (var ch in conns.Values)
                ch.Writer.TryWrite(1);
    }
}
