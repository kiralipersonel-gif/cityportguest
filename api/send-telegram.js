import crypto from 'node:crypto';
import { findGuestName, getActiveGuest, verifyFirebaseIdToken } from '../lib/guest-security.js';
import { firebaseRequest, firebaseTransaction, getFirebaseConfig } from '../lib/firebase-rest.js';

function parseChatIds(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function istanbulDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function istanbulMinutes() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());
  return Number(parts.find(part => part.type === 'hour')?.value) * 60
    + Number(parts.find(part => part.type === 'minute')?.value);
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
  const { type, room, detail, guestName, idToken, language } = request.body || {};
  if (!room || !detail || String(detail).length > 3000) return response.status(400).json({ error: 'Invalid request' });
  if (!['request', 'issue', 'cleaning', 'review', 'status_toggle'].includes(type)) return response.status(400).json({ error: 'Invalid request type' });

  const auth = await verifyFirebaseIdToken(idToken);
  if (auth.error) return response.status(401).json({ error: auth.error });
  const guest = await getActiveGuest(room);
  if (guest.error) return response.status(guest.error === 'Stay has ended' ? 401 : 502).json({ error: guest.error, code: guest.code });
  const matchedGuestName = findGuestName(guestName, guest.record);
  if (!matchedGuestName) return response.status(403).json({ error: 'Guest name does not match the room record' });

  const database = getFirebaseConfig();
  if (!database) return response.status(500).json({ error: 'Request service is not configured' });
  const requestChatIds = parseChatIds(process.env.TELEGRAM_REQUEST_CHAT_IDS || process.env.TELEGRAM_CHANNEL_CHAT_ID || process.env.TELEGRAM_CHAT_IDS || process.env.TELEGRAM_CHAT_ID);
  const sessionChatIds = parseChatIds(process.env.TELEGRAM_SESSION_CHAT_IDS || process.env.TELEGRAM_SESSION_CHAT_ID || process.env.TELEGRAM_CHAT_IDS || process.env.TELEGRAM_CHAT_ID);
  const targetChatIds = ['issue', 'request', 'cleaning'].includes(type) ? requestChatIds : sessionChatIds;
  if (!process.env.TELEGRAM_BOT_TOKEN || targetChatIds.length === 0) return response.status(500).json({ error: 'Telegram is not configured for this notification type' });

  const roomId = String(guest.roomId);
  if (type === 'cleaning') {
    if (istanbulMinutes() >= 14 * 60) {
      return response.status(400).json({ error: 'Cleaning requests must be sent before 14:00', code: 'CLEANING_CUTOFF_PASSED' });
    }
    const history = await firebaseRequest('guest_requests', {}, database);
    if (!history.ok) return response.status(502).json({ error: 'Cleaning request history unavailable', code: 'FIREBASE_CLEANING_HISTORY_READ_FAILED' });
    const alreadyRequested = Object.values(history.data || {}).some(item =>
      String(item?.roomNumber || item?.roomId) === roomId
      && item?.requestType === 'cleaning'
      && item?.createdAt
      && new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Istanbul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date(item.createdAt)) === istanbulDate()
    );
    if (alreadyRequested) return response.status(409).json({ error: 'A cleaning request has already been sent today', code: 'CLEANING_DAILY_LIMIT' });
  }

  let quotaPath = null;
  let fingerprint = null;
  let quotaDate = null;
  if (type === 'request') {
    quotaDate = istanbulDate();
    fingerprint = crypto.createHash('sha256')
      .update(`${matchedGuestName.toLocaleLowerCase('tr-TR').normalize('NFKC')}|${String(detail).trim().toLocaleLowerCase('tr-TR').normalize('NFKC')}`)
      .digest('hex');
    const guestKey = crypto.createHash('sha256')
      .update(matchedGuestName.toLocaleLowerCase('tr-TR').normalize('NFKC'))
      .digest('hex').slice(0, 20);
    quotaPath = `guest_request_limits/${encodeURIComponent(roomId)}/${guestKey}/${quotaDate}`;
    let baselineCount = 0;
    let baselineRecent = [];
    const quotaState = await firebaseRequest(quotaPath, {}, database);
    if (!quotaState.ok) return response.status(502).json({ error: 'Request limit could not be verified', code: 'REQUEST_LIMIT_UNAVAILABLE' });
    if (!quotaState.data) {
      const history = await firebaseRequest('guest_requests', {}, database);
      if (!history.ok) return response.status(502).json({ error: 'Request history could not be read', code: 'REQUEST_LIMIT_UNAVAILABLE' });
      const now = Date.now();
      const records = Object.values(history.data || {}).filter(item =>
        String(item?.roomNumber || item?.roomId) === roomId
        && String(item?.guestName || '').toLocaleLowerCase('tr-TR').normalize('NFKC') === matchedGuestName.toLocaleLowerCase('tr-TR').normalize('NFKC')
        && item?.requestType !== 'cleaning'
        && item?.requestType !== 'cafe'
        && Number(item?.createdAt) > 0
        && new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Istanbul',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(new Date(Number(item.createdAt))) === quotaDate
      );
      baselineCount = records.length;
      baselineRecent = records
        .filter(item => Number(item.createdAt) > now - 10 * 60 * 1000)
        .map(item => ({
          fingerprint: item.requestFingerprint || crypto.createHash('sha256')
            .update(`${matchedGuestName.toLocaleLowerCase('tr-TR').normalize('NFKC')}|${String(item.description || '').trim().toLocaleLowerCase('tr-TR').normalize('NFKC')}`)
            .digest('hex'),
          createdAt: Number(item.createdAt)
        }));
    }
    let rejection = null;
    const reservation = await firebaseTransaction(quotaPath, current => {
      const now = Date.now();
      const state = current && typeof current === 'object'
        ? current
        : { count: baselineCount, recent: baselineRecent };
      const recent = (Array.isArray(state.recent) ? state.recent : [])
        .filter(item => Number(item.createdAt) > now - 10 * 60 * 1000);
      if (recent.some(item => item.fingerprint === fingerprint)) {
        rejection = 'DUPLICATE_REQUEST';
        return undefined;
      }
      if (Number(state.count || 0) >= 5) {
        rejection = 'DAILY_REQUEST_LIMIT';
        return undefined;
      }
      return {
        count: Number(state.count || 0) + 1,
        recent: [...recent, { fingerprint, createdAt: now }],
        updatedAt: now
      };
    }, database);
    if (!reservation.ok) {
      return response.status(reservation.status === 409 ? 503 : 502).json({ error: 'Request limit could not be verified', code: 'REQUEST_LIMIT_UNAVAILABLE' });
    }
    if (rejection === 'DUPLICATE_REQUEST') return response.status(409).json({ error: 'This request was already sent recently', code: rejection });
    if (rejection === 'DAILY_REQUEST_LIMIT') return response.status(429).json({ error: 'The daily request limit of five has been reached', code: rejection });
  }

  const labels = { request: 'Yeni Talep', issue: 'Arıza Kaydı', cleaning: 'Temizlik Talebi', review: 'Düşük Puanlı Değerlendirme' };
  const createdAt = Date.now();
  const recordType = type === 'issue' ? 'issues' : type === 'request' || type === 'cleaning' ? 'guest_requests' : null;
  let recordId = null;
  if (recordType) {
    const record = {
      roomNumber: roomId,
      roomId,
      guestName: String(matchedGuestName).slice(0, 200),
      language: ['tr', 'en', 'de', 'ru', 'ar', 'fa'].includes(language) ? language : 'tr',
      description: String(detail).slice(0, 3000),
      requestType: type === 'cleaning' ? 'cleaning' : String(detail).split('\n')[0].slice(0, 120),
      requestCategory: type === 'request' ? String(detail).split('\n')[0].slice(0, 120) : null,
      guestRequestKind: type === 'request' ? 'normal' : null,
      issueType: type === 'issue' ? String(detail).split('\n')[0].slice(0, 120) : null,
      priority: type === 'issue' ? 'high' : 'normal',
      status: type === 'issue' ? 'open' : 'pending',
      createdAt,
      updatedAt: createdAt,
      requestFingerprint: type === 'request' ? fingerprint : null,
      source: 'guest-web-app'
    };
    const saved = await firebaseRequest(recordType, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    }, database);
    if (!saved.ok) {
      if (type === 'request' && quotaPath && fingerprint) {
        const rollback = await firebaseTransaction(quotaPath, current => {
          if (!current || typeof current !== 'object') return current;
          return {
            ...current,
            count: Math.max(0, Number(current.count || 0) - 1),
            recent: (Array.isArray(current.recent) ? current.recent : []).filter(item => item.fingerprint !== fingerprint)
          };
        }, database);
        if (!rollback.ok) console.error('[Cityport] Request quota rollback failed', { roomId, date: quotaDate });
      }
      console.error('Guest request write failed', { status: saved.status, recordType });
      return response.status(502).json({ error: 'Guest request could not be recorded', code: 'FIREBASE_REQUEST_WRITE_FAILED' });
    }
    recordId = saved.data?.name || null;
  }

  const text = `Cityport Hotel\n${labels[type] || 'Misafir Mesajı'}\nOda: ${roomId.slice(0, 10)}\nMisafir: ${String(matchedGuestName).slice(0, 200)}\n\n${String(detail).slice(0, 3000)}`;
  const shortType = recordType === 'issues' ? 'i' : 'r';
  const keyboard = recordId && recordType ? {
    inline_keyboard: [
      [
        { text: '🔄 İşleme al', callback_data: `st|${shortType}|${recordId}|working` },
        { text: '✅ Tamamlandı', callback_data: `st|${shortType}|${recordId}|done` }
      ],
      [{ text: '✖ İptal', callback_data: `st|${shortType}|${recordId}|cancel` }]
    ]
  } : undefined;
  const telegramResponses = await Promise.all(targetChatIds.map(chatId => fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, ...(keyboard ? { reply_markup: keyboard } : {}) })
  })));
  const failedDeliveries = telegramResponses.filter(result => !result.ok);
  if (failedDeliveries.length === telegramResponses.length) {
    const errorBody = await failedDeliveries[0]?.text().catch(() => '');
    console.error('Telegram delivery failed', { chatIds: targetChatIds, status: failedDeliveries[0]?.status, response: errorBody.slice(0, 500) });
    return response.status(502).json({ error: 'Telegram delivery failed' });
  }
  return response.status(200).json({ ok: true, recordType, recordId, recipients: targetChatIds.length });
}
