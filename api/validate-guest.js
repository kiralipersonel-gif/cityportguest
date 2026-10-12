import { findGuestName, getActiveGuest, verifyFirebaseIdToken } from '../lib/guest-security.js';

async function notifyGuestLogin(room, guestName) {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!botToken || !chatId) return;

  const now = new Date();
  const date = now.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
  const time = now.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const telegram = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `Cityport Hotel\nOturum Bildirimi\nOda: ${String(room).slice(0, 10)}\nMisafir: ${String(guestName).slice(0, 200)}\nTarih: ${date}\nSaat: ${time}`
      }),
      signal: controller.signal
    });
    if (!telegram.ok) console.warn('[Cityport] Guest login notification failed:', telegram.status);
  } catch (error) {
    console.warn('[Cityport] Guest login notification error:', error?.message || 'Unknown error');
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    return response.status(405).json({
      ok: false,
      error: 'Method not allowed',
      code: 'METHOD_NOT_ALLOWED'
    });
  }

  try {
    const body = request.body || {};
    const room = typeof body.room === 'string' ? body.room.trim() : String(body.room || '').trim();
    const guestName = typeof body.guestName === 'string' ? body.guestName.trim() : '';
    const idToken = typeof body.idToken === 'string' ? body.idToken.trim() : '';

    if (!room) {
      return response.status(400).json({
        ok: false,
        error: 'Room is required',
        code: 'ROOM_REQUIRED'
      });
    }

    if (!guestName || !idToken) {
      return response.status(400).json({
        ok: false,
        error: 'Guest name and authentication are required',
        code: 'GUEST_AUTH_REQUIRED'
      });
    }

    const auth = await verifyFirebaseIdToken(idToken);

    if (!auth || auth.error) {
      console.error('[Cityport] Firebase ID token verification failed:', auth?.error || 'UNKNOWN_AUTH_ERROR');
      return response.status(401).json({
        ok: false,
        error: auth?.error || 'Authentication failed',
        code: auth?.code || 'FIREBASE_TOKEN_INVALID'
      });
    }

    const guest = await getActiveGuest(room);

    if (!guest || guest.error) {
      const code = guest?.code || 'GUEST_LOOKUP_FAILED';
      const error = guest?.error || 'Guest record could not be read';

      console.error('[Cityport] Guest lookup failed:', {
        room,
        code,
        error
      });

      let status = 502;
      if (error === 'Stay has ended') status = 401;
      else if (code === 'FIREBASE_SERVER_CREDENTIAL_MISSING') status = 500;
      else if (code === 'ROOM_NOT_FOUND') status = 404;

      return response.status(status).json({
        ok: false,
        error,
        code
      });
    }

    if (!guest.record) {
      console.error('[Cityport] Guest lookup returned no record:', { room, guest });
      return response.status(502).json({
        ok: false,
        error: 'Guest record is missing',
        code: 'GUEST_RECORD_MISSING'
      });
    }

    const matchedGuestName = findGuestName(guestName, guest.record);
    if (!matchedGuestName) {
      console.warn('[Cityport] Guest name mismatch:', {
        room,
        suppliedName: guestName,
        hasStoredName: Boolean(guest.record.guestName)
      });

      return response.status(403).json({
        ok: false,
        error: 'Guest name does not match the room record',
        code: 'GUEST_NAME_MISMATCH'
      });
    }

    await notifyGuestLogin(guest.roomId, matchedGuestName);

    return response.status(200).json({
      ok: true,
      room: guest.roomId,
      guestName: matchedGuestName,
      checkinDate: guest.record.checkinDate,
      checkoutDate: guest.record.checkoutDate,
      statusKey: guest.record.statusKey || null,
      cleaningRequestSentToday: Boolean(guest.cleaningRequestSentToday),
      doNotDisturb: guest.record.doNotDisturb || { enabled: false }
    });
  } catch (error) {
    console.error('[Cityport] /api/validate-guest unexpected error:', error);

    return response.status(500).json({
      ok: false,
      error: 'Guest validation service failed',
      code: 'VALIDATE_GUEST_INTERNAL_ERROR',
      // Safe diagnostic only; never expose secrets or stack traces.
      detail: error?.message || 'Unknown server error'
    });
  }
}
