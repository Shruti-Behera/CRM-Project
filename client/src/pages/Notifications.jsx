import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Pill, Empty } from '../components/Bits.jsx';
import { useNotifications, notificationPath } from '../lib/notifications.jsx';

const MODULE_TONE = {
  assignment: 'p-progress', opportunity: 'p-review', account: 'p-review',
  work_approval: 'p-pending', meeting: 'p-progress', institution: 'p-review',
  research_report: 'p-done', user: 'p-hold', Security: 'p-red'
};

export default function Notifications() {
  const nav = useNavigate();
  const { items, unread, total, loadMore, markRead, markAll, remove, clearAll } = useNotifications();
  const [filter, setFilter] = useState('all');   // all | unread

  const shown = useMemo(
    () => filter === 'unread' ? items.filter(n => Number(n.is_read) === 0) : items,
    [items, filter]);

  const open = (n) => {
    if (Number(n.is_read) === 0) markRead(n.id);
    const to = notificationPath(n);
    if (to) nav(to);
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div><div className="eyebrow">Everything that happened</div><h3>Notifications</h3></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn${filter === 'all' ? ' primary' : ''}`} onClick={() => setFilter('all')}>All</button>
          <button className={`btn${filter === 'unread' ? ' primary' : ''}`} onClick={() => setFilter('unread')}>Unread ({unread})</button>
          {unread > 0 && <button className="btn" onClick={markAll}>Mark all read</button>}
          {items.length > 0 && <button className="btn" style={{ color: 'var(--red)' }} onClick={clearAll}>Clear all</button>}
        </div>
      </div>

      <Card pad={false}>
        <table className="tbl">
          <thead><tr><th></th><th>Module</th><th>Notification</th><th>From</th><th>When</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>
            {shown.length ? shown.map(n => {
              const unreadRow = Number(n.is_read) === 0;
              const to = notificationPath(n);
              return (
                <tr key={n.id} style={{ background: unreadRow ? '#F5F9FF' : undefined }}>
                  <td style={{ width: 14 }}><span className="notif-dot" style={{ background: unreadRow ? 'var(--cyan)' : 'transparent' }} /></td>
                  <td><Pill kind={MODULE_TONE[n.entity_type] || MODULE_TONE[n.type] || 'p-hold'}>{n.entity_type || n.type}</Pill></td>
                  <td style={{ cursor: to ? 'pointer' : 'default' }} onClick={() => open(n)}>
                    <div style={{ fontWeight: unreadRow ? 600 : 500, fontSize: 13 }}>{n.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{n.message}</div>
                  </td>
                  <td style={{ fontSize: 12.5 }}>{n.sender || 'system'}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{n.created_at}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {unreadRow && <button className="btn" style={{ padding: '2px 8px' }} onClick={() => markRead(n.id)}>Read</button>}{' '}
                    <button className="btn" style={{ padding: '2px 8px', color: 'var(--red)' }} onClick={() => remove(n.id)}>Delete</button>
                  </td>
                </tr>
              );
            }) : <Empty cols={6}>No notifications{filter === 'unread' ? ' unread' : ''}.</Empty>}
          </tbody>
        </table>
        <div className="eyebrow" style={{ padding: '10px 15px', display: 'flex', justifyContent: 'space-between' }}>
          <span>{shown.length} shown{filter === 'all' ? ` of ${total}` : ''}</span>
          {filter === 'all' && items.length < total &&
            <button className="btn" style={{ padding: '2px 10px' }} onClick={loadMore}>Load more</button>}
        </div>
      </Card>
    </>
  );
}
