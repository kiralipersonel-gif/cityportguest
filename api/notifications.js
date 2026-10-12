import { findGuestName, getActiveGuest, verifyFirebaseIdToken } from '../lib/guest-security.js';
import { firebaseRequest, getFirebaseConfig } from '../lib/firebase-rest.js';
import { getCheckoutNotificationCopy, getStatusNotificationCopy } from '../lib/notification-copy.js';

async function authenticate(body) {
  const room = String(body.room || '').trim();
  const guestName = String(body.guestName || '').trim();
  const auth = await verifyFirebaseIdToken(body.idToken);
  if (!room || !guestName || auth.error) return { error: 'Guest authentication is required', status: 401 };
  const guest = await getActiveGuest(room);
  if (guest.error) return { error: guest.error, status: guest.error === 'Stay has ended' ? 401 : 502 };
  const matchedGuestName = findGuestName(guestName, guest.record);
  if (!matchedGuestName) return { error: 'Guest name does not match the room record', status: 403 };
  const config = getFirebaseConfig();
  if (!config) return { error: 'Notification service is not configured', status: 500 };
  return { room: guest.roomId, guestName: matchedGuestName, config };
}

function validNotificationId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value);
}

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });

  const body = request.body || {};
  const guest = await authenticate(body);
  if (guest.error) return response.status(guest.status).json({ error: guest.error });
  const path = `guest_notifications/${encodeURIComponent(guest.room)}`;

  if (body.action === 'list') {
    const result = await firebaseRequest(path, {}, guest.config);
    if (!result.ok) return response.status(502).json({ error: 'Notifications could not be read' });
    const items = Object.entries(result.data || {})
      .map(([id, item]) => ({ id, ...item }))
      .filter(item => item.guestName === guest.guestName)
      .map(item => {
        const language = bodyLanguage(request.body?.language);
        if (item.kind === 'checkout') {
          const [title, message] = getCheckoutNotificationCopy(language);
          return { ...item, title, body: message };
        }
        if (item.statusAction && ['request', 'issue', 'order', 'taxi'].includes(item.kind)) {
          const [title, message] = getStatusNotificationCopy(item.kind, item.statusAction, language);
          return { ...item, title, body: message };
        }
        return item;
      })
      .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));
    return response.status(200).json({ ok: true, items });
  }

  function bodyLanguage(value) {
    return ['tr', 'en', 'de', 'ru', 'ar', 'fa'].includes(value) ? value : 'tr';
  }

  const notificationId = body.notificationId;
  if (!validNotificationId(notificationId)) return response.status(400).json({ error: 'A valid notification id is required' });
  const notificationPath = `${path}/${encodeURIComponent(notificationId)}`;

  if (body.action === 'read') {
    const existing = await firebaseRequest(notificationPath, {}, guest.config);
    if (!existing.ok || !existing.data || existing.data.guestName !== guest.guestName) {
      return response.status(404).json({ error: 'Notification not found' });
    }
    const updated = await firebaseRequest(notificationPath, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: true, readAt: Date.now() })
    }, guest.config);
    if (!updated.ok) return response.status(502).json({ error: 'Notification could not be marked as read' });
    return response.status(200).json({ ok: true });
  }

  if (body.action === 'delete') {
    const existing = await firebaseRequest(notificationPath, {}, guest.config);
    if (!existing.ok || !existing.data || existing.data.guestName !== guest.guestName) {
      return response.status(404).json({ error: 'Notification not found' });
    }
    const deleted = await firebaseRequest(notificationPath, { method: 'DELETE' }, guest.config);
    if (!deleted.ok) return response.status(502).json({ error: 'Notification could not be deleted' });
    return response.status(200).json({ ok: true });
  }

  return response.status(400).json({ error: 'Unknown notification action' });
}
