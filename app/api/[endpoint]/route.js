import cafeHandler from '../../../api/cafe.js';
import doNotDisturbHandler from '../../../api/do-not-disturb.js';
import guestAccountHandler from '../../../api/guest-account.js';
import pushSubscriptionHandler from '../../../api/push-subscription.js';
import sendPushHandler from '../../../api/send-push.js';
import sendTelegramHandler from '../../../api/send-telegram.js';
import notificationsHandler from '../../../api/notifications.js';
import telegramWebhookHandler from '../../../api/telegram-webhook.js';
import taxiRequestHandler from '../../../api/taxi-request.js';
import validateGuestHandler from '../../../api/validate-guest.js';

const handlers = {
  cafe: cafeHandler,
  'do-not-disturb': doNotDisturbHandler,
  'guest-account': guestAccountHandler,
  notifications: notificationsHandler,
  'push-subscription': pushSubscriptionHandler,
  'send-push': sendPushHandler,
  'send-telegram': sendTelegramHandler,
  'telegram-webhook': telegramWebhookHandler,
  'taxi-request': taxiRequestHandler,
  'validate-guest': validateGuestHandler
};

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function dispatch(request, context) {
  const { endpoint } = await context.params;
  const handler = handlers[endpoint];
  if (!handler) return Response.json({ error: 'Not found' }, { status: 404 });

  let body;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    const rawBody = await request.text();
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
    }
  }

  let statusCode = 200;
  const responseHeaders = new Headers();
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(name, value) {
      responseHeaders.set(name, value);
      return this;
    },
    json(data) {
      return Response.json(data, { status: statusCode, headers: responseHeaders });
    }
  };

  const url = new URL(request.url);
  const legacyRequest = {
    method: request.method,
    body,
    headers: Object.fromEntries(request.headers.entries()),
    query: Object.fromEntries(url.searchParams.entries())
  };
  const result = await handler(legacyRequest, response);
  return result instanceof Response ? result : new Response(null, { status: 204, headers: responseHeaders });
}

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
