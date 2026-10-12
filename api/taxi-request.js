import { findGuestName, getActiveGuest, verifyFirebaseIdToken } from '../lib/guest-security.js';

function databaseConfig() {
  const databaseUrl = String(process.env.FIREBASE_DATABASE_URL || '').trim().replace(/\/+$/, '');
  const secret = String(process.env.FIREBASE_DATABASE_SECRET || '').trim();
  return databaseUrl && secret ? { databaseUrl, secret } : null;
}

async function firebaseRequest(path, config, options = {}) {
  const url = `${config.databaseUrl}/${path}.json?auth=${encodeURIComponent(config.secret)}`;
  const response = await fetch(url, {
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (error) { data = null; }
  return { ok: response.ok, status: response.status, data };
}

async function authenticateGuest(body) {
  const room = typeof body.room === 'string' ? body.room.trim() : String(body.room || '').trim();
  const guestName = typeof body.guestName === 'string' ? body.guestName.trim() : '';
  const idToken = typeof body.idToken === 'string' ? body.idToken.trim() : '';
  if (!room || !guestName || !idToken) return { error: 'Room, guest name and authentication are required', status: 400 };

  const auth = await verifyFirebaseIdToken(idToken);
  if (auth.error) return { error: auth.error, status: 401 };
  const guest = await getActiveGuest(room);
  if (!guest || guest.error) return { error: guest?.error || 'Guest data unavailable', status: guest?.error === 'Stay has ended' ? 401 : 502 };
  const matchedGuestName = findGuestName(guestName, guest.record);
  if (!matchedGuestName) return { error: 'Guest name does not match the room record', status: 403 };
  const config = databaseConfig();
  if (!config) return { error: 'Taxi service is not configured', status: 500 };
  return { room: guest.roomId, matchedGuestName, config };
}

function isTrabzonCoordinates(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= 40.3 && latitude <= 41.4
    && longitude >= 39.1 && longitude <= 40.8;
}

function parseTelegramChatIds() {
  const configured = process.env.TELEGRAM_REQUEST_CHAT_IDS
    || process.env.TELEGRAM_CHANNEL_CHAT_ID
    || process.env.TELEGRAM_CHANNEL_CHAT_IDS
    || process.env.TELEGRAM_CHAT_IDS
    || process.env.TELEGRAM_CHAT_ID
    || '';
  return [...new Set(String(configured).split(/[,\s]+/).map(value => value.trim()).filter(Boolean))];
}

async function sendTelegram(text, requestId, withStatusButtons = true) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatIds = parseTelegramChatIds();
  if (!token || !chatIds.length) return { sent: false, error: 'Telegram bot or chat target is not configured' };

  const payload = { text };
  if (withStatusButtons) {
    payload.reply_markup = {
      inline_keyboard: [
        [
          { text: '🚕 Taksi çağrıldı', callback_data: `t|${requestId}|called` },
          { text: '✅ Hazır', callback_data: `t|${requestId}|ready` }
        ],
        [{ text: '✖ İptal', callback_data: `t|${requestId}|cancel` }]
      ]
    };
  }
  const results = await Promise.all(chatIds.map(async chatId => {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, chat_id: chatId })
      });
      const result = await response.json().catch(() => ({}));
      return response.ok && result.ok;
    } catch (error) {
      console.error('[Cityport] Taxi Telegram delivery failed:', error?.message || error);
      return false;
    }
  }));
  return { sent: results.some(Boolean), error: results.some(Boolean) ? null : 'Telegram rejected every taxi message' };
}

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  const body = request.body || {};

  if (request.method === 'GET') {
    const cronSecret = String(process.env.CRON_SECRET || '').trim();
    if (!cronSecret || String(request.headers['authorization'] || '') !== `Bearer ${cronSecret}`) {
      return response.status(401).json({ error: 'Unauthorized' });
    }
    const config = databaseConfig();
    if (!config) return response.status(500).json({ error: 'Taxi service is not configured' });
    const records = await firebaseRequest('guest_requests', config);
    if (!records.ok) return response.status(502).json({ error: 'Taxi records could not be read' });
    const now = Date.now();
    const expired = Object.entries(records.data || {}).filter(([, item]) => item?.requestType === 'taxi' && Number(item.expiresAt) <= now);
    await Promise.all(expired.map(([id]) => firebaseRequest(`guest_requests/${encodeURIComponent(id)}`, config, { method: 'DELETE' })));
    return response.status(200).json({ ok: true, deleted: expired.length });
  }

  const guest = await authenticateGuest(body);
  if (guest.error) return response.status(guest.status).json({ error: guest.error });

  if (request.method === 'DELETE') {
    const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
    if (!requestId) return response.status(400).json({ error: 'Taxi request id is required' });
    const existing = await firebaseRequest(`guest_requests/${encodeURIComponent(requestId)}`, guest.config);
    if (!existing.ok || !existing.data || existing.data.requestType !== 'taxi') return response.status(404).json({ error: 'Taxi request not found' });
    if (String(existing.data.roomNumber || existing.data.roomId) !== String(guest.room) || existing.data.guestName !== guest.matchedGuestName) return response.status(403).json({ error: 'Taxi request does not belong to this guest' });
    const cancelled = await firebaseRequest(`guest_requests/${encodeURIComponent(requestId)}`, guest.config, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled', updatedAt: Date.now() })
    });
    if (!cancelled.ok) return response.status(502).json({ error: 'Taxi request could not be cancelled' });
    const sent = await sendTelegram(`Cityport Hotel\nTaksi Talebi Misafir Tarafından İptal Edildi\nOda: ${guest.room}\nMisafir: ${guest.matchedGuestName}`, requestId, false);
    if (!sent.sent) console.error('[Cityport] Taxi cancellation could not be forwarded to Telegram:', sent.error);
    return response.status(200).json({ ok: true });
  }

  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
  const passengerCount = Number(body.passengerCount);
  if (!Number.isInteger(passengerCount) || passengerCount < 1 || passengerCount > 8) {
    return response.status(400).json({ error: 'Passenger count must be between 1 and 8' });
  }
  if (!['cash', 'card'].includes(body.paymentMethod)) {
    return response.status(400).json({ error: 'A valid payment method is required' });
  }
  const language = ['tr', 'en', 'de', 'ru', 'ar', 'fa'].includes(body.language) ? body.language : 'tr';
  const pickupInput = body.pickup && typeof body.pickup === 'object' ? body.pickup : {};
  const pickupType = pickupInput.type === 'location' ? 'location' : pickupInput.type === 'hotel' ? 'hotel' : '';
  const pickupLatitude = pickupType === 'hotel' ? 41.006323 : Number(pickupInput.latitude);
  const pickupLongitude = pickupType === 'hotel' ? 39.734137 : Number(pickupInput.longitude);
  const pickupLabel = pickupType === 'hotel' ? 'Cityport Hotel' : String(pickupInput.label || '').trim().slice(0, 240);
  if (!pickupType || !pickupLabel || !isTrabzonCoordinates(pickupLatitude, pickupLongitude)) {
    return response.status(400).json({ error: 'A valid pickup location in Trabzon is required' });
  }
  let destination = null;
  if (body.destination !== null && body.destination !== undefined) {
    const input = typeof body.destination === 'object' ? body.destination : {};
    const latitude = Number(input.latitude);
    const longitude = Number(input.longitude);
    const label = String(input.label || '').trim().slice(0, 240);
    if (!label || !isTrabzonCoordinates(latitude, longitude)) {
      return response.status(400).json({ error: 'A valid destination in Trabzon is required' });
    }
    destination = { label, latitude, longitude };
  }
  const createdAt = Date.now();
  const expiresAt = createdAt + 30 * 60 * 1000;
  const record = {
    roomNumber: String(guest.room),
    roomId: String(guest.room),
    guestName: guest.matchedGuestName,
    description: 'Taksi talebi',
    requestType: 'taxi',
    priority: 'normal',
    status: 'pending',
    language,
    passengerCount,
    pickup: {
      type: pickupType,
      label: pickupLabel,
      latitude: pickupLatitude,
      longitude: pickupLongitude
    },
    destination,
    paymentMethod: body.paymentMethod,
    createdAt,
    updatedAt: createdAt,
    expiresAt,
    source: 'guest-web-app'
  };
  const created = await firebaseRequest('guest_requests', guest.config, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record)
  });
  if (!created.ok || !created.data?.name) return response.status(502).json({ error: 'Taxi request could not be recorded' });
  const paymentLabel = body.paymentMethod === 'card' ? 'Kredi kartı' : 'Nakit';
  const text = [
    'Cityport Hotel',
    'Yeni Taksi Talebi',
    `Oda: ${guest.room}`,
    `Misafir: ${guest.matchedGuestName}`,
    `Yolcu sayısı: ${passengerCount}`,
    `Alınış: ${pickupLabel}${pickupType === 'location' ? ` (${pickupLatitude.toFixed(5)}, ${pickupLongitude.toFixed(5)})` : ''}`,
    `Varış: ${destination ? `${destination.label} (${destination.latitude.toFixed(5)}, ${destination.longitude.toFixed(5)})` : 'Belirtilmedi'}`,
    `Ödeme: ${paymentLabel}`,
    `Uygulama dili: ${language.toUpperCase()}`,
    'Durum: Bekliyor'
  ].join('\n');
  const telegram = await sendTelegram(text, created.data.name);
  const result = { ok: telegram.sent, requestId: created.data.name, expiresAt };
  if (!telegram.sent) {
    console.error('[Cityport] Taxi request saved but Telegram delivery failed:', telegram.error);
    return response.status(502).json({ ...result, code: 'TAXI_SAVED_TELEGRAM_FAILED', error: 'Taxi request was saved, but Telegram notification could not be sent' });
  }
  return response.status(200).json(result);
}
