import { findGuestName, getActiveGuest, verifyFirebaseIdToken } from '../lib/guest-security.js';

function databaseConfig() {
  const databaseUrl = String(process.env.FIREBASE_DATABASE_URL || '').trim().replace(/\/+$/, '');
  const secret = String(process.env.FIREBASE_DATABASE_SECRET || '').trim();
  return databaseUrl && secret ? { databaseUrl, secret } : null;
}

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });

  const body = request.body || {};
  const room = String(body.room || '').trim();
  const guestName = String(body.guestName || '').trim();
  const idToken = String(body.idToken || '').trim();
  if (!room || !guestName || !idToken || typeof body.enabled !== 'boolean') {
    return response.status(400).json({ error: 'Room, guest authentication and enabled are required' });
  }

  const auth = await verifyFirebaseIdToken(idToken);
  if (auth.error) return response.status(401).json({ error: 'Authentication failed' });

  const guest = await getActiveGuest(room);
  if (guest.error) return response.status(guest.error === 'Stay has ended' ? 401 : 502).json({ error: guest.error });

  const matchedGuestName = findGuestName(guestName, guest.record);
  if (!matchedGuestName) return response.status(403).json({ error: 'Guest name does not match the room record' });

  const database = databaseConfig();
  if (!database) return response.status(500).json({ error: 'Do not disturb service is not configured' });

  const record = {
    enabled: body.enabled,
    updatedAt: Date.now(),
    guestName: String(matchedGuestName).slice(0, 200),
    source: 'cityport-guest-web-app'
  };
  const firebaseResponse = await fetch(`${database.databaseUrl}/rooms/${encodeURIComponent(guest.roomId)}/doNotDisturb.json?auth=${encodeURIComponent(database.secret)}`, {
    method: 'PUT',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(record)
  });

  if (!firebaseResponse.ok) return response.status(502).json({ error: 'Do not disturb preference could not be saved' });
  return response.status(200).json({ ok: true, room: guest.roomId, doNotDisturb: record });
}