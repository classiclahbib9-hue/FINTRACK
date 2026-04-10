/**
 * Quick verification: count docs in Firestore transactions collection
 */
const https = require('https');
const PROJECT_ID = 'fintrackers-506db';
const API_KEY    = 'AIzaSyDY3lsrN74evhncxgu8V9bEfw7VUTPMlyg';

function httpsReq(opts, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  // 1. Get token
  const authBody = JSON.stringify({ returnSecureToken: true });
  const auth = await httpsReq({
    hostname: 'identitytoolkit.googleapis.com',
    path: `/v1/accounts:signUp?key=${API_KEY}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(authBody) }
  }, authBody);
  if (!auth.idToken) { console.error('Auth failed:', auth); process.exit(1); }

  // 2. List all docs
  const data = await httpsReq({
    hostname: 'firestore.googleapis.com',
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/transactions?pageSize=300`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${auth.idToken}` }
  });

  if (!data.documents) {
    console.log('❌ NO DOCUMENTS FOUND in Firestore!');
    console.log('Raw response:', JSON.stringify(data).slice(0, 500));
    process.exit(1);
  }

  console.log(`✅ Found ${data.documents.length} documents in Firestore`);
  // Show first 3
  data.documents.slice(0, 3).forEach(doc => {
    const name = doc.name.split('/').pop();
    const note = doc.fields.note?.stringValue || '';
    const amount = doc.fields.amount?.doubleValue || doc.fields.amount?.integerValue || 0;
    console.log(`   • ${name}: ${amount} – ${note}`);
  });
}
main();
