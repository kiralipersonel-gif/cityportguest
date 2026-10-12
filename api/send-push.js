import crypto from 'node:crypto';
import { parseTurkishCheckout } from '../lib/guest-security.js';
import { saveGuestNotification } from '../lib/guest-notifications.js';
import { getCheckoutNotificationCopy } from '../lib/notification-copy.js';

let accessTokenCache = null;

function databaseConfig() {
  const databaseUrl = String(process.env.FIREBASE_DATABASE_URL || '').trim().replace(/\/+$/, '');
  const secret = String(process.env.FIREBASE_DATABASE_SECRET || '').trim();
  return databaseUrl && secret ? { databaseUrl, secret } : null;
}

export async function sendRoomPush(room, guestName, title, body, url = '/') {
  const account = serviceAccount();
  const config = databaseConfig();
  if (!account || !config) throw new Error('Push service credentials are not configured');
  const subscriptions = await firebaseRequest('push_subscriptions', config);
  if (!subscriptions.ok) throw new Error('Push subscriptions could not be read');
  const candidates = Object.values(subscriptions.data || {}).filter(item =>
    item?.token
    && String(item.roomNumber) === String(room)
    && String(item.guestName).toLocaleLowerCase('tr-TR') === String(guestName).toLocaleLowerCase('tr-TR')
  );
  const results = await Promise.all(candidates.map(item => sendToToken(
    account,
    item.token,
    title.slice(0, 120),
    body.slice(0, 500),
    url
  ).catch(error => {
    console.error('[Cityport] Push delivery failed:', error?.message || error);
    return false;
  })));
  return { attempted: results.length, sent: results.filter(Boolean).length };
}

function guestNames(record) {
  const names = Array.isArray(record?.guestNames)
    ? record.guestNames
    : record?.guestNames && typeof record.guestNames === 'object'
      ? Object.values(record.guestNames)
      : [];
  return [...new Set([record?.guestName, ...names].filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))];
}

function serviceAccount() {
  try {
    const value = JSON.parse(String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}'));
    return value.client_email && value.private_key && value.project_id ? value : null;
  } catch (error) {
    return null;
  }
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

async function getAccessToken(account) {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now() + 60000) return accessTokenCache.token;
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const assertion = `${header}.${claim}.${signer.sign(account.private_key, 'base64url')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) throw new Error('FCM OAuth token could not be created');
  accessTokenCache = { token: result.access_token, expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000 };
  return accessTokenCache.token;
}

async function firebaseRequest(path, config) {
  const response = await fetch(`${config.databaseUrl}/${path}.json?auth=${encodeURIComponent(config.secret)}`, { headers: { Accept: 'application/json' } });
  return { ok: response.ok, data: await response.json().catch(() => null) };
}

async function sendToToken(account, token, title, body, url = '/') {
  const accessToken = await getAccessToken(account);
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token, data: { title, body, url } } })
  });
  return response.ok;
}

function todayInIstanbul() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
}

function checkoutMatchesToday(value) {
  const checkout = parseTurkishCheckout(value);
  if (!checkout) return false;
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(checkout);
  return date === todayInIstanbul();
}

function authorizedExternalRequest(request) {
  const expected = String(process.env.PUSH_API_SECRET || '').trim();
  return expected && String(request.headers.authorization || '') === `Bearer ${expected}`;
}

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  const account = serviceAccount();
  const config = databaseConfig();
  if (!account || !config) return response.status(500).json({ error: 'Push service credentials are not configured' });

  const isCron = request.method === 'GET';
  if (isCron) {
    const cronSecret = String(process.env.CRON_SECRET || '').trim();
    if (!cronSecret || String(request.headers.authorization || '') !== `Bearer ${cronSecret}`) return response.status(401).json({ error: 'Unauthorized' });
  } else if (request.method !== 'POST' || !authorizedExternalRequest(request)) {
    return response.status(401).json({ error: 'Unauthorized' });
  }

  const subscriptions = await firebaseRequest('push_subscriptions', config);
  if (!subscriptions.ok) return response.status(502).json({ error: 'Push subscriptions could not be read' });
  const records = Object.values(subscriptions.data || {}).filter(item => item?.token);
  let candidates = records;
  let title = String(request.body?.title || 'Cityport Hotel');
  let body = String(request.body?.body || '');
  let url = String(request.body?.url || '/');

  if (isCron) {
    const rooms = await firebaseRequest('rooms', config);
    if (!rooms.ok) return response.status(502).json({ error: 'Guest checkout records could not be read' });
    const matchingRooms = Object.entries(rooms.data || {}).filter(([, room]) => room?.occupied && checkoutMatchesToday(room.checkoutDate));
    let notices = 0;
    for (const [roomId, room] of matchingRooms) {
      const names = guestNames(room);
      for (const guestName of names) {
        const stableId = `checkout-${todayInIstanbul()}-${crypto.createHash('sha256').update(guestName.toLocaleLowerCase('tr-TR')).digest('hex').slice(0, 10)}`;
        const existing = await firebaseRequest(`guest_notifications/${encodeURIComponent(roomId)}/${stableId}`, config);
        if (!existing.ok) return response.status(502).json({ error: 'Checkout notification status could not be read' });
        if (existing.data) continue;
        await saveGuestNotification(roomId, guestName, {
          title: 'Cityport Hotel',
          body: 'Today is your checkout day. Please vacate your room by 12:00.',
          kind: 'checkout'
        }, stableId);
        notices += 1;
        const roomSubscriptions = records.filter(item => String(item.roomNumber) === String(roomId) && String(item.guestName).toLocaleLowerCase('tr-TR') === guestName.toLocaleLowerCase('tr-TR'));
        await Promise.all(roomSubscriptions.map(item => {
          const [localizedTitle, localizedBody] = getCheckoutNotificationCopy(item.language);
          return sendToToken(account, item.token, localizedTitle, localizedBody, '/').catch(error => {
            console.error('[Cityport] Checkout push delivery failed:', error?.message || error);
            return false;
          });
        }));
      }
    }
    return response.status(200).json({ ok: true, attempted: matchingRooms.length, notifications: notices, date: todayInIstanbul() });
  } else {
    const room = String(request.body?.room || '').trim();
    if (!body || body.length > 500 || !room) return response.status(400).json({ error: 'room and body are required' });
    candidates = candidates.filter(item => String(item.roomNumber) === room);
  }

  const results = await Promise.all(candidates.map(async item => ({ ok: await sendToToken(account, item.token, title.slice(0, 120), body.slice(0, 500), url).catch(() => false), token: item.token })));
  return response.status(200).json({ ok: true, attempted: results.length, sent: results.filter(item => item.ok).length, date: todayInIstanbul() });
}
