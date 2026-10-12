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
  const auth = await verifyFirebaseIdToken(body.idToken);
  if (auth.error) return response.status(401).json({ error: 'Authentication failed' });
  const room = String(body.room || '').trim();
  const guestName = String(body.guestName || '').trim();
  const guest = await getActiveGuest(room);
  if (guest.error) return response.status(guest.error === 'Stay has ended' ? 401 : 502).json({ error: guest.error });
  const matchedGuestName = findGuestName(guestName, guest.record);
  if (!matchedGuestName) return response.status(403).json({ error: 'Guest name does not match the room record' });
  const database = databaseConfig();
  if (!database) return response.status(500).json({ error: 'Account service is not configured' });
  const [requestsResult, issuesResult] = await Promise.all([
    fetch(`${database.databaseUrl}/guest_requests.json?auth=${encodeURIComponent(database.secret)}`, { headers: { Accept: 'application/json' } }),
    fetch(`${database.databaseUrl}/issues.json?auth=${encodeURIComponent(database.secret)}`, { headers: { Accept: 'application/json' } })
  ]);
  if (!requestsResult.ok || !issuesResult.ok) return response.status(502).json({ error: 'Account history could not be read' });
  const requestRecords = Object.entries(await requestsResult.json() || {}).map(([id, item]) => ({ id, ...item }));
  const issueRecords = Object.entries(await issuesResult.json() || {}).map(([id, item]) => ({ id, ...item, requestType: 'issue' }));
  const records = [...requestRecords, ...issueRecords].filter(item => String(item.roomNumber || item.roomId) === String(guest.roomId) && String(item.guestName) === String(matchedGuestName));
  const items = records.map(item => ({ id: item.id, type: item.requestType || item.issueType || 'request', description: item.description || '', total: Number(item.total || 0), currency: item.currency || 'TRY', status: item.status || 'pending', createdAt: item.createdAt || null }));
  const total = items.reduce((sum, item) => sum + item.total, 0);
  return response.status(200).json({ ok: true, items, total, currency: 'TRY' });
}
