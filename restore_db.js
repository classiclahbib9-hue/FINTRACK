/**
 * FineTrack – Firestore Restore Script
 * Reads import_data.json and uploads all transactions to Firestore.
 * Uses Firebase REST API (no admin SDK needed) + anonymous auth.
 *
 * Run: node restore_db.js
 */

const fs = require('fs');
const https = require('https');

// ── Your Firebase project config ─────────────────────────────────
const PROJECT_ID = 'fintrackers-506db';
const API_KEY    = 'AIzaSyDY3lsrN74evhncxgu8V9bEfw7VUTPMlyg';

// ── Load backup data ──────────────────────────────────────────────
const dataPath = './import_data.json';
if (!fs.existsSync(dataPath)) {
  console.error('❌ import_data.json not found!');
  process.exit(1);
}
const transactions = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
console.log(`📦 Loaded ${transactions.length} transactions from import_data.json`);

// ── Helper: HTTPS request as Promise ─────────────────────────────
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Step 1: Get anonymous token ───────────────────────────────────
async function getAuthToken() {
  console.log('🔐 Signing in anonymously...');
  const body = JSON.stringify({ returnSecureToken: true });
  const res = await httpsRequest({
    hostname: 'identitytoolkit.googleapis.com',
    path: `/v1/accounts:signUp?key=${API_KEY}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, body);

  if (res.status !== 200) {
    console.error('❌ Auth failed:', JSON.stringify(res.body));
    process.exit(1);
  }
  console.log('✅ Authenticated anonymously');
  return res.body.idToken;
}

// ── Step 2: Upload one transaction ────────────────────────────────
function toFirestoreValue(val) {
  if (typeof val === 'string')  return { stringValue: val };
  if (typeof val === 'number')  return { doubleValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  return { stringValue: String(val) };
}

async function uploadTransaction(token, tx) {
  const { id, ...fields } = tx;
  const firestoreFields = {};
  for (const [k, v] of Object.entries(fields)) {
    firestoreFields[k] = toFirestoreValue(v);
  }

  const body = JSON.stringify({ fields: firestoreFields });
  const path = id
    ? `/v1/projects/${PROJECT_ID}/databases/(default)/documents/transactions/${id}`
    : `/v1/projects/${PROJECT_ID}/databases/(default)/documents/transactions`;

  const method = id ? 'PATCH' : 'POST';

  const res = await httpsRequest({
    hostname: 'firestore.googleapis.com',
    path,
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Content-Length': Buffer.byteLength(body)
    }
  }, body);

  return res.status;
}

// ── Step 3: Run restore ───────────────────────────────────────────
async function main() {
  const token = await getAuthToken();

  let success = 0, failed = 0;
  const total = transactions.length;

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const progress = `[${i + 1}/${total}]`;
    try {
      const status = await uploadTransaction(token, tx);
      if (status === 200 || status === 201) {
        success++;
        process.stdout.write(`\r${progress} ✅ Uploaded: ${tx.note || tx.category}                 `);
      } else {
        failed++;
        console.log(`\n${progress} ⚠️  Status ${status} for ID: ${tx.id}`);
      }
    } catch (err) {
      failed++;
      console.log(`\n${progress} ❌ Error for ID: ${tx.id} – ${err.message}`);
    }
  }

  console.log(`\n\n🎉 Restore complete!`);
  console.log(`   ✅ Uploaded : ${success}`);
  if (failed > 0) console.log(`   ❌ Failed   : ${failed}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
