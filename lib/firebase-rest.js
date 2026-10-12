export function getFirebaseConfig() {
  const databaseUrl = String(process.env.FIREBASE_DATABASE_URL || '').trim().replace(/\/+$/, '');
  const secret = String(process.env.FIREBASE_DATABASE_SECRET || '').trim();
  return databaseUrl && secret ? { databaseUrl, secret } : null;
}

export function firebaseUrl(path, config = getFirebaseConfig()) {
  if (!config) throw new Error('Firebase server credentials are not configured');
  return `${config.databaseUrl}/${path}.json?auth=${encodeURIComponent(config.secret)}`;
}

export async function firebaseRequest(path, options = {}, config = getFirebaseConfig()) {
  const response = await fetch(firebaseUrl(path, config), {
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) }
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error(`Firebase returned invalid JSON for ${path}`, { cause: error });
    }
  }
  return { ok: response.ok, status: response.status, data, etag: response.headers.get('ETag') };
}

export async function firebaseTransaction(path, update, config = getFirebaseConfig(), maxAttempts = 5) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const current = await fetch(firebaseUrl(path, config), {
      headers: { Accept: 'application/json', 'X-Firebase-ETag': 'true' }
    });
    if (!current.ok) return { ok: false, status: current.status, data: null };
    const value = await current.json();
    const etag = current.headers.get('ETag');
    if (!etag) throw new Error('Firebase did not return an ETag for a conditional update');
    const next = update(value);
    if (next === undefined) return { ok: true, committed: false, data: value };

    const committed = await fetch(firebaseUrl(path, config), {
      method: 'PUT',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'If-Match': etag },
      body: JSON.stringify(next)
    });
    if (committed.status === 412) continue;
    if (!committed.ok) return { ok: false, status: committed.status, data: null };
    return { ok: true, committed: true, data: next };
  }
  return { ok: false, status: 409, data: null, contention: true };
}
