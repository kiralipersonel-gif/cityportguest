const monthNames = {
  Oca: 0, Şub: 1, Mar: 2, Nis: 3, May: 4, Haz: 5,
  Tem: 6, Ağu: 7, Eyl: 8, Eki: 9, Kas: 10, Ara: 11
};

export function parseTurkishDate(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+(\d{4})$/);
  if (!match) return null;
  const month = monthNames[match[2]];
  if (month === undefined) return null;
  const day = Number(match[1]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return date;
}

export function parseTurkishCheckout(value) {
  const date = parseTurkishDate(value);
  return date ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 9)) : null;
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function distanceFromHotel(latitude, longitude) {
  const hotelLatitude = envNumber('HOTEL_LATITUDE', 41.006327);
  const hotelLongitude = envNumber('HOTEL_LONGITUDE', 39.731562);
  const earthRadius = 6371000;
  const toRadians = value => value * Math.PI / 180;
  const lat = Number(latitude);
  const lon = Number(longitude);
  const latitudeDelta = toRadians(lat - hotelLatitude);
  const longitudeDelta = toRadians(lon - hotelLongitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(hotelLatitude)) * Math.cos(toRadians(lat)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isNearHotel(latitude, longitude, accuracy = 0) {
  return getLocationCheck(latitude, longitude, accuracy).allowed;
}

export function getLocationCheck(latitude, longitude, accuracy = 0) {
  const numericLatitude = Number(latitude);
  const numericLongitude = Number(longitude);
  const radius = envNumber('HOTEL_RADIUS_METERS', 500);
  const coarseRadius = envNumber('COARSE_LOCATION_RADIUS_METERS', 1500);
  const reportedAccuracy = Number(accuracy);
  const accuracyLimit = envNumber('MAX_LOCATION_ACCURACY_METERS', 1000);
  const accuracyAllowance = Number.isFinite(reportedAccuracy) && reportedAccuracy > 0
    ? Math.min(reportedAccuracy, 250)
    : 0;
  const validCoordinates = Number.isFinite(numericLatitude)
    && Number.isFinite(numericLongitude)
    && numericLatitude >= -90 && numericLatitude <= 90
    && numericLongitude >= -180 && numericLongitude <= 180;
  const distance = validCoordinates
    ? Math.round(distanceFromHotel(numericLatitude, numericLongitude))
    : null;
  const usableAccuracy = Number.isFinite(reportedAccuracy)
    && reportedAccuracy > 0
    && reportedAccuracy <= accuracyLimit;
  const effectiveRadius = usableAccuracy ? radius + accuracyAllowance : coarseRadius;
  const allowed = validCoordinates && distance <= effectiveRadius;
  let reason = null;
  if (!validCoordinates) reason = 'invalid_coordinates';
  else if (!usableAccuracy && !allowed) reason = 'low_accuracy';
  else if (!allowed) reason = 'too_far';
  return {
    allowed,
    distance,
    radius: effectiveRadius,
    accuracy: Number.isFinite(reportedAccuracy) ? Math.round(reportedAccuracy) : null,
    accuracyLimit,
    reason
  };
}

function getFirebaseDatabaseConfig() {
  const databaseUrl = String(process.env.FIREBASE_DATABASE_URL || '').trim().replace(/\/+$/, '');
  const secret = String(process.env.FIREBASE_DATABASE_SECRET || '').trim();
  if (!databaseUrl || !secret) {
    return {
      error: 'Guest validation is not configured',
      code: 'FIREBASE_SERVER_CREDENTIAL_MISSING'
    };
  }
  return { databaseUrl, secret };
}

async function firebaseGet(path, config) {
  const url = `${config.databaseUrl}/${path}.json?auth=${encodeURIComponent(config.secret)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (error) {
      console.error('[Cityport] Firebase returned invalid JSON:', {
        path,
        status: response.status,
        error: error?.message
      });
      return {
        ok: false,
        status: response.status,
        error: 'Firebase returned invalid JSON',
        code: 'FIREBASE_INVALID_JSON'
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: 'Firebase request failed',
        code: 'FIREBASE_REQUEST_FAILED',
        data
      };
    }
    return { ok: true, data };
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    console.error('[Cityport] Firebase request exception:', {
      path,
      name: error?.name,
      message: error?.message
    });
    return {
      ok: false,
      status: 504,
      error: aborted ? 'Firebase request timed out' : 'Firebase request failed',
      code: aborted ? 'FIREBASE_TIMEOUT' : 'FIREBASE_NETWORK_ERROR'
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function getActiveGuest(room) {
  const config = getFirebaseDatabaseConfig();
  if (config.error) return config;

  const roomId = String(room || '').replace(/[^0-9A-Za-z_-]/g, '').slice(0, 12);
  if (!roomId) return { error: 'Invalid room', code: 'INVALID_ROOM' };

  const roomResponse = await firebaseGet(`rooms/${encodeURIComponent(roomId)}`, config);
  if (!roomResponse.ok) {
    console.error('[Cityport] Firebase room read failed', {
      status: roomResponse.status,
      code: roomResponse.code,
      roomId
    });
    return {
      error: 'Guest data unavailable',
      code: 'FIREBASE_ROOM_READ_FAILED',
      status: roomResponse.status
    };
  }

  const record = roomResponse.data;
  if (!record || typeof record !== 'object') {
    return { error: 'Room record not found', code: 'ROOM_NOT_FOUND' };
  }

  const checkout = parseTurkishCheckout(record.checkoutDate);
  const hasGuestNames = Array.isArray(record.guestNames)
    ? record.guestNames.some(name => typeof name === 'string' && name.trim())
    : record.guestNames && typeof record.guestNames === 'object'
      ? Object.values(record.guestNames).some(name => typeof name === 'string' && name.trim())
      : false;
  if (!record.occupied || (!record.guestName && !hasGuestNames) || !checkout) {
    return { error: 'Stay has ended', code: 'STAY_INVALID' };
  }
  if (checkout.getTime() < Date.now()) {
    return { error: 'Stay has ended', code: 'STAY_ENDED' };
  }

  let cleaningRequestSentToday = false;
  const requestsResponse = await firebaseGet('guest_requests', config);
  if (requestsResponse.ok) {
    const requests = requestsResponse.data || {};
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
    cleaningRequestSentToday = Object.values(requests).some(item => {
      if (!item || typeof item !== 'object') return false;
      const created = item.createdAt ? new Date(item.createdAt) : null;
      return String(item.roomNumber || item.roomId) === roomId
        && item.requestType === 'cleaning'
        && created && !Number.isNaN(created.getTime())
        && created.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' }) === today;
    });
  } else {
    // Cleaning history is optional for login. Do not block a valid guest session.
    console.warn('[Cityport] Cleaning request status could not be read', {
      status: requestsResponse.status,
      roomId,
      code: requestsResponse.code
    });
  }

  return { roomId, record, cleaningRequestSentToday };
}

export function maskName(value) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  return words.map((word, index) => index === 0
    ? `${word[0]}${'*'.repeat(Math.max(1, word.length - 1))}`
    : `${word[0]}.`
  ).join(' ');
}

export function normalizeGuestName(value) {
  return String(value || '')
    .trim()
    .replace(/Ä°|Ã°/g, 'I')
    .replace(/Äž|Ãž/g, 'G')
    .replace(/Åž|ÅŸ/g, 'S')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('tr-TR')
    .replace(/[^A-Z0-9ÇĞİÖŞÜ]/g, ' ')
    .replace(/Ç/g, 'C')
    .replace(/Ğ/g, 'G')
    .replace(/İ/g, 'I')
    .replace(/Ö/g, 'O')
    .replace(/Ş/g, 'S')
    .replace(/Ü/g, 'U')
    .replace(/\s+/g, ' ')
    .trim();
}

function editDistance(left, right) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = row[rightIndex];
      row[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? diagonal
        : Math.min(diagonal + 1, above + 1, row[rightIndex - 1] + 1);
      diagonal = above;
    }
  }
  return row[right.length];
}

export function guestNamesMatch(input, stored) {
  const inputName = normalizeGuestName(input);
  const storedName = normalizeGuestName(stored);
  if (!inputName || !storedName) return false;
  if (inputName === storedName) return true;

  const inputWords = inputName.split(' ');
  const storedWords = storedName.split(' ');
  if (inputWords.length < 2 || storedWords.length < 2) return false;

  const matchedWords = inputWords.filter(inputWord => storedWords.some(storedWord => {
    const limit = Math.max(1, Math.floor(Math.max(inputWord.length, storedWord.length) * 0.25));
    return editDistance(inputWord, storedWord) <= limit;
  }));

  const wordCoverage = matchedWords.length / inputWords.length;
  const fullLimit = Math.max(2, Math.floor(storedName.length * 0.12));
  return wordCoverage >= 0.75 || editDistance(inputName, storedName) <= fullLimit;
}

export function findGuestName(input, record) {
  const names = Array.isArray(record?.guestNames)
    ? record.guestNames
    : record?.guestNames && typeof record.guestNames === 'object'
      ? Object.values(record.guestNames)
      : [];
  const candidates = names.filter(name => typeof name === 'string' && name.trim());
  if (typeof record?.guestName === 'string' && record.guestName.trim() && !candidates.length) candidates.push(record.guestName);
  return candidates.find(name => guestNamesMatch(input, name)) || null;
}

export async function verifyFirebaseIdToken(idToken) {
  const apiKey = String(process.env.FIREBASE_WEB_API_KEY || '').trim();
  if (!idToken) {
    return { error: 'Authentication token is missing', code: 'FIREBASE_TOKEN_MISSING' };
  }
  if (!apiKey) {
    return { error: 'Authentication is not configured', code: 'FIREBASE_WEB_API_KEY_MISSING' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`;
    const authResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ idToken: String(idToken) }),
      signal: controller.signal
    });

    const text = await authResponse.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (error) {
      console.error('[Cityport] Firebase token lookup returned invalid JSON:', error?.message);
      return {
        error: 'Authentication service returned invalid data',
        code: 'FIREBASE_AUTH_INVALID_JSON'
      };
    }

    if (!authResponse.ok) {
      const firebaseCode = payload?.error?.message || `AUTH_HTTP_${authResponse.status}`;
      console.error('[Cityport] Firebase token lookup failed:', {
        status: authResponse.status,
        firebaseCode
      });
      return { error: 'Authentication failed', code: firebaseCode, status: authResponse.status };
    }

    const user = payload.users?.[0];
    return user
      ? { user }
      : { error: 'Authentication failed', code: 'FIREBASE_USER_NOT_FOUND' };
  } catch (error) {
    console.error('[Cityport] Firebase token verification exception:', {
      name: error?.name,
      message: error?.message
    });
    return {
      error: error?.name === 'AbortError' ? 'Authentication service timed out' : 'Authentication service unavailable',
      code: error?.name === 'AbortError' ? 'FIREBASE_AUTH_TIMEOUT' : 'FIREBASE_AUTH_NETWORK_ERROR'
    };
  } finally {
    clearTimeout(timer);
  }
}
