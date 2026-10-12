import { firebaseRequest, getFirebaseConfig } from './firebase-rest.js';

export async function saveGuestNotification(room, guestName, notification, id) {
  const config = getFirebaseConfig();
  if (!config) throw new Error('Firebase server credentials are not configured');
  const notificationId = id || `n-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const result = await firebaseRequest(
    `guest_notifications/${encodeURIComponent(room)}/${encodeURIComponent(notificationId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...notification,
        guestName,
        createdAt: Date.now(),
        read: false
      })
    },
    config
  );
  if (!result.ok) throw new Error(`Firebase could not save guest notification (${result.status})`);
  return notificationId;
}
