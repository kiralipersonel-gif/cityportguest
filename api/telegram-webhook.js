import { firebaseRequest, getFirebaseConfig } from '../lib/firebase-rest.js';
import { saveGuestNotification } from '../lib/guest-notifications.js';
import { getStatusNotificationCopy } from '../lib/notification-copy.js';
import { sendRoomPush } from './send-push.js';

async function telegramCall(method, payload) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const result = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!result.ok) throw new Error(`Telegram ${method} failed with status ${result.status}`);
  const body = await result.json();
  if (!body.ok) throw new Error(`Telegram ${method} returned an error`);
  return body.result;
}

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
  const configuredSecret = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (!configuredSecret || request.headers['x-telegram-bot-api-secret-token'] !== configuredSecret) {
    return response.status(401).json({ error: 'Unauthorized Telegram webhook' });
  }

  const callback = request.body?.callback_query;
  if (!callback) return response.status(200).json({ ok: true });
  const allowedUsers = String(process.env.TELEGRAM_STATUS_USER_IDS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!allowedUsers.includes(String(callback.from?.id))) {
    await telegramCall('answerCallbackQuery', { callback_query_id: callback.id, text: 'Not authorized', show_alert: true });
    return response.status(200).json({ ok: true });
  }

  const match = String(callback.data || '').match(/^(?:st\|(i|r)\|([A-Za-z0-9_-]{1,120})\|(working|done|cancel)|o\|([A-Za-z0-9_-]{1,120})\|(done|cancel)|t\|([A-Za-z0-9_-]{1,120})\|(called|ready|cancel))$/);
  if (!match) {
    await telegramCall('answerCallbackQuery', { callback_query_id: callback.id, text: 'Invalid status action', show_alert: true });
    return response.status(200).json({ ok: true });
  }
  const issueOrRequest = match[1];
  const recordId = match[2] || match[4] || match[6];
  const action = match[3] || match[5] || match[7];
  const kind = match[6] ? 'taxi' : match[4] ? 'order' : issueOrRequest === 'i' ? 'issue' : 'request';

  await telegramCall('answerCallbackQuery', { callback_query_id: callback.id, text: 'Updating status…' })
    .catch(error => console.error('[Cityport] Telegram callback acknowledgement failed:', error?.message || error));
  const database = getFirebaseConfig();
  if (!database) return response.status(500).json({ error: 'Firebase server credentials are not configured' });
  const recordType = kind === 'issue' ? 'issues' : 'guest_requests';
  const path = `${recordType}/${encodeURIComponent(recordId)}`;
  const existing = await firebaseRequest(path, {}, database);
  if (!existing.ok || !existing.data) return response.status(404).json({ error: 'Request record not found' });
  const record = existing.data;
  if (kind === 'order' && record.requestType !== 'cafe') return response.status(400).json({ error: 'Order record not found' });
  if (kind === 'taxi' && record.requestType !== 'taxi') return response.status(400).json({ error: 'Taxi request not found' });
  const mappedStatus = kind === 'taxi'
    ? action === 'called' ? 'called' : action === 'ready' ? 'ready' : 'cancelled'
    : kind === 'order'
    ? action === 'done' ? 'completed' : 'cancelled'
    : kind === 'issue'
      ? action === 'working' ? 'in_progress' : action === 'done' ? 'resolved' : 'cancelled'
      : action === 'working' ? 'processing' : action === 'done' ? 'completed' : 'cancelled';

  const statusChanged = record.status !== mappedStatus;
  if (statusChanged) {
    const updated = await firebaseRequest(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: mappedStatus, updatedAt: Date.now() })
    }, database);
    if (!updated.ok) return response.status(502).json({ error: 'Firebase status update failed' });

  }

  const notifyKind = kind;
  const [title, body] = getStatusNotificationCopy(notifyKind, action, record.language || 'tr');
  const notificationId = `${notifyKind}-${recordId}-${action}`;
  const notificationPath = `guest_notifications/${encodeURIComponent(record.roomId || record.roomNumber)}/${encodeURIComponent(notificationId)}`;
  const existingNotification = await firebaseRequest(notificationPath, {}, database);
  if (!existingNotification.ok) return response.status(502).json({ error: 'Guest notification status could not be read' });
  if (!existingNotification.data) {
    await saveGuestNotification(record.roomId || record.roomNumber, record.guestName, {
      title,
      body,
      kind: notifyKind,
      statusAction: action,
      requestId: recordId
    }, notificationId);
    try {
      await sendRoomPush(record.roomId || record.roomNumber, record.guestName, title, body, '/');
    } catch (error) {
      console.error('[Cityport] Status push delivery failed:', error?.message || error);
    }
  }

  if (callback.message?.chat?.id && callback.message?.message_id) {
    await telegramCall('editMessageReplyMarkup', {
      chat_id: callback.message.chat.id,
      message_id: callback.message.message_id,
      reply_markup: kind === 'taxi' && action === 'called'
        ? { inline_keyboard: [[
          { text: '✅ Hazır', callback_data: `t|${recordId}|ready` },
          { text: '✖ İptal', callback_data: `t|${recordId}|cancel` }
        ]] }
        : { inline_keyboard: [] }
    }).catch(error => console.error('[Cityport] Telegram keyboard update failed:', error?.message || error));
  }
  return response.status(200).json({ ok: true, status: mappedStatus });
}
