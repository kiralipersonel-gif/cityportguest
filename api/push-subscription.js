import { findGuestName, getActiveGuest, verifyFirebaseIdToken } from '../lib/guest-security.js';

function databaseConfig() {
  const databaseUrl = String(process.env.FIREBASE_DATABASE_URL || '').trim().replace(/\/+$/, '');
  const secret = String(process.env.FIREBASE_DATABASE_SECRET || '').trim();
  return databaseUrl && secret ? { databaseUrl, secret } : null;
}

async function firebaseRequest(path, config, options = {}) {
  const response = await fetch(`${config.databaseUrl}/${path}.json?auth=${encodeURIComponent(config.secret)}`, {
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (error) { data = null; }
  return { ok: response.ok, status: response.status, data };
}

async function authenticate(body) {
  const room = String(body.room || '').trim();
  const guestName = String(body.guestName || '').trim();
  const idToken = String(body.idToken || '').trim();
  if (!room || !guestName || !idToken) return { error: 'Guest authentication is required', status: 400 };
  const auth = await verifyFirebaseIdToken(idToken);
  if (auth.error) return { error: auth.error, status: 401 };
  const guest = await getActiveGuest(room);
  if (guest.error) return { error: guest.error, status: guest.error === 'Stay has ended' ? 401 : 502 };
  const matchedGuestName = findGuestName(guestName, guest.record);
  if (!matchedGuestName) return { error: 'Guest name does not match the room record', status: 403 };
  const config = databaseConfig();
  if (!config) return { error: 'Push service is not configured', status: 500 };
  return { room: guest.roomId, matchedGuestName, config };
}

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  if (!['POST', 'DELETE'].includes(request.method)) return response.status(405).json({ error: 'Method not allowed' });

  const body = request.body || {};
  const guest = await authenticate(body);
  if (guest.error) return response.status(guest.status).json({ error: guest.error });
  const token = String(body.token || '').trim();
  if (!token || token.length > 4096) return response.status(400).json({ error: 'A valid push token is required' });
  const tokenId = encodeURIComponent(Buffer.from(token).toString('base64url').slice(0, 120));
  const path = `push_subscriptions/${tokenId}`;

  if (request.method === 'DELETE') {
    await firebaseRequest(path, guest.config, { method: 'DELETE' });
    return response.status(200).json({ ok: true });
  }

  const record = {
    token,
    roomNumber: String(guest.room),
    guestName: String(guest.matchedGuestName).slice(0, 200),
    checkoutDate: String(body.checkoutDate || '').slice(0, 80),
    language: String(body.language || 'tr').slice(0, 5),
    updatedAt: Date.now(),
    source: 'cityport-guest-web-app'
  };
  const saved = await firebaseRequest(path, guest.config, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) });
  if (!saved.ok) return response.status(502).json({ error: 'Push subscription could not be saved' });
  return response.status(200).json({ ok: true });
}