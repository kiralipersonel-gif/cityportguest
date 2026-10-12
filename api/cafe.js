import { findGuestName, getActiveGuest, verifyFirebaseIdToken } from '../lib/guest-security.js';

function config() {
  const databaseUrl = String(process.env.FIREBASE_DATABASE_URL || '').trim().replace(/\/+$/, '');
  const secret = String(process.env.FIREBASE_DATABASE_SECRET || '').trim();
  return databaseUrl && secret ? { databaseUrl, secret } : null;
}

async function firebase(path, options = {}) {
  const database = config();
  if (!database) return { ok: false, status: 500, data: null };
  const response = await fetch(`${database.databaseUrl}/${path}.json?auth=${encodeURIComponent(database.secret)}`, {
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) }
  });
  return { ok: response.ok, status: response.status, data: await response.json().catch(() => null) };
}

async function telegram(text, orderId) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatIds = String(process.env.TELEGRAM_REQUEST_CHAT_IDS || process.env.TELEGRAM_CHANNEL_CHAT_ID || process.env.TELEGRAM_CHANNEL_CHAT_IDS || process.env.TELEGRAM_CHAT_IDS || process.env.TELEGRAM_CHAT_ID || '')
    .split(',').map(value => value.trim()).filter(Boolean);
  if (!token || !chatIds.length) {
    console.error('[Cityport] Cafe order saved but Telegram is not configured', {
      hasBotToken: Boolean(token),
      hasChatIds: chatIds.length > 0
    });
    return false;
  }
  const results = await Promise.all(chatIds.map(async chatId => {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          reply_markup: { inline_keyboard: [[
            { text: '✅ Tamamlandı', callback_data: `o|${orderId}|done` },
            { text: '✖ İptal', callback_data: `o|${orderId}|cancel` }
          ]] }
        })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) {
        console.error('[Cityport] Cafe order Telegram delivery failed', {
          status: response.status,
          description: result?.description || 'Telegram returned an unsuccessful response'
        });
        return false;
      }
      return true;
    } catch (error) {
      console.error('[Cityport] Cafe order Telegram request failed:', error?.message || error);
      return false;
    }
  }));
  return results.some(Boolean);
}

async function authenticate(body) {
  const room = String(body.room || '').trim();
  const guestName = String(body.guestName || '').trim();
  const auth = await verifyFirebaseIdToken(body.idToken);
  if (!room || !guestName || auth.error) return { error: 'Guest authentication is required', status: 401 };
  const guest = await getActiveGuest(room);
  if (guest.error) return { error: guest.error, status: guest.error === 'Stay has ended' ? 401 : 502 };
  const matchedGuestName = findGuestName(guestName, guest.record);
  if (!matchedGuestName) return { error: 'Guest name does not match the room record', status: 403 };
  return { room: guest.roomId, guestName: matchedGuestName };
}

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  if (request.method === 'GET') {
    const result = await firebase('cafe_products');
    if (!result.ok) return response.status(result.status || 502).json({ error: 'Cafe menu could not be read' });
    const products = Object.entries(result.data || {}).map(([id, product]) => ({ id, ...product })).filter(product => product.active !== false && product.name && Number(product.price) >= 0);
    return response.status(200).json({ ok: true, products });
  }
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
  const guest = await authenticate(request.body || {});
  if (guest.error) return response.status(guest.status).json({ error: guest.error });
  const paymentMethod = request.body?.paymentMethod;
  if (!['cash', 'card'].includes(paymentMethod)) return response.status(400).json({ error: 'Choose cash or card as the payment preference' });
  const requestedItems = Array.isArray(request.body?.items) ? request.body.items : [];
  if (!requestedItems.length || requestedItems.length > 30) return response.status(400).json({ error: 'At least one cafe item is required' });
  const menu = await firebase('cafe_products');
  if (!menu.ok) return response.status(502).json({ error: 'Cafe menu could not be read' });
  const lines = [];
  for (const item of requestedItems) {
    const product = menu.data?.[item.id];
    const quantity = Math.max(1, Math.min(20, Number(item.quantity)));
    const unitPrice = Number(product?.price);
    if (!product || product.active === false || !product.name || !Number.isFinite(quantity) || !Number.isFinite(unitPrice) || unitPrice < 0) return response.status(400).json({ error: 'Invalid cafe item' });
    lines.push({ productId: item.id, name: String(product.name).slice(0, 120), quantity, unitPrice, total: unitPrice * quantity });
  }
  const total = lines.reduce((sum, item) => sum + item.total, 0);
  const createdAt = Date.now();
  const language = ['tr', 'en', 'de', 'ru', 'ar', 'fa'].includes(request.body?.language) ? request.body.language : 'tr';
  const record = { roomNumber: String(guest.room), roomId: String(guest.room), guestName: guest.guestName, language, description: lines.map(item => `${item.quantity} x ${item.name}`).join('\n'), items: lines, total, currency: 'TRY', paymentMethod, requestType: 'cafe', priority: 'normal', status: 'pending', createdAt, updatedAt: createdAt, source: 'guest-web-app' };
  const saved = await firebase('guest_requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) });
  if (!saved.ok) return response.status(502).json({ error: 'Cafe order could not be recorded' });
  const paymentLabel = paymentMethod === 'card' ? 'Kredi kartı (ödeme tercihi)' : 'Nakit';
  const telegramSent = saved.data?.name
    ? await telegram(`Cityport Hotel\nYeni Kafe Siparişi\nSipariş no: ${saved.data.name}\nOda: ${guest.room}\nMisafir: ${guest.guestName}\nÖdeme tercihi: ${paymentLabel}\nToplam: ${total.toFixed(2)} TRY\n\n${record.description}`, saved.data.name)
    : false;
  if (!telegramSent) {
    console.error('[Cityport] Cafe order saved but could not be delivered to Telegram', {
      requestId: saved.data?.name || null,
      room: guest.room
    });
    return response.status(502).json({
      error: 'Cafe order was recorded, but the staff notification could not be delivered',
      code: 'ORDER_SAVED_TELEGRAM_FAILED',
      requestId: saved.data?.name || null
    });
  }
  return response.status(200).json({ ok: true, total, requestId: saved.data?.name || null });
}
