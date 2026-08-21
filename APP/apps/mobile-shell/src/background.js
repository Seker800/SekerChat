// Capacitor Background Runner — runs periodically when app is backgrounded.
// Each invocation is a fresh context. Calls resolve() when done.

addEventListener('backgroundFetch', (resolve, reject) => {
  pollAndNotify()
    .then((result) => resolve(result))
    .catch((err) => reject(err));
});

async function pollAndNotify() {
  try {
    // Read saved config from CapacitorKV (background runner's own storage)
    const { value: url } = CapacitorKV.get('sekerchat_url');
    const { value: token } = CapacitorKV.get('sekerchat_device_token');
    const { value: lastCursor } = CapacitorKV.get('sekerchat_last_cursor');

    if (!url || !token) {
      return { skipped: true, reason: 'no config or token' };
    }

    const base = url.replace(/\/+$/, '');
    const params = new URLSearchParams();
    params.set('limit', '10');
    if (lastCursor) params.set('cursor', lastCursor);

    const res = await fetch(`${base}/api/realtime/events?${params}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-reminder-device-token': token,
      },
    });

    if (!res.ok) {
      return { error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    const events = data.events || [];
    if (events.length === 0) {
      return { skipped: true, reason: 'no new events' };
    }

    // Schedule local notification for each new message/task event
    for (const ev of events) {
      const title = notificationTitle(ev);
      const body = notificationBody(ev);
      if (!title) continue;

      CapacitorNotifications.schedule([
        {
          id: hashToId(ev.eventId),
          title,
          body,
        },
      ]);
    }

    // Save latest cursor
    const newCursor = data.cursor || events[events.length - 1]?.eventId;
    if (newCursor) {
      CapacitorKV.set('sekerchat_last_cursor', newCursor);
    }

    return { notified: events.length };
  } catch (err) {
    return { error: err.message };
  }
}

function notificationTitle(ev) {
  if (ev.eventVersion !== 1) return null;
  switch (ev.type) {
    case 'message.created.v1':
      return '新消息';
    case 'task.created.v1':
      return '新任务';
    case 'task.updated.v1':
      return '任务更新';
    default:
      return null;
  }
}

function notificationBody(ev) {
  switch (ev.type) {
    case 'message.created.v1':
      return ev.payload?.content?.slice(0, 120) || '你收到一条新消息';
    case 'task.created.v1':
      return ev.payload?.title || '新任务已创建';
    case 'task.updated.v1':
      return ev.payload?.title || '任务已更新';
    default:
      return '';
  }
}

function hashToId(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 2147483647;
}
