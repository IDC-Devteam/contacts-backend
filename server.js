// 🌌 Built with cosmic precision by ADA × NovaCircuit — Intergalactic Dev Crew (IDC)

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('express-rate-limit');

const app = express();

/**
 * CORS strategy
 * - In development (NODE_ENV !== 'production'): allow all origins for convenience.
 * - In production: allow ONLY the comma-separated list from ALLOWED_ORIGINS.
 */
const isProd = process.env.NODE_ENV === 'production';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: isProd
    ? function (origin, callback) {
        // Allow non-browser clients (no Origin header) like curl/Postman
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`CORS blocked: ${origin} not in ALLOWED_ORIGINS`));
      }
    : true, // dev: wildcard
  credentials: false,
}));

// 🧱 JSON body limit (contacts can be sizable but bounded)
app.use(express.json({ limit: '1mb' }));

// 🧪 Health check (useful for ngrok/uptime monitors)
app.get('/health', (_req, res) => res.json({ ok: true, service: 'contacts-backend' }));

const SUPABASE_URL = process.env.SUPABASE_URL;
// Accept both names, prefer SERVICE_KEY
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const USER_PIN = process.env.USER_PIN || '123456';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_(SERVICE_)KEY in .env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const fail = (res, code, msg) => res.status(code).json({ ok: false, error: msg });

// 🔑 PIN authentication middleware
const requirePin = (req, res, next) => {
  const headerPin = req.headers['x-pin'];
  const bodyPin   = req.body && req.body.pin;
  const queryPin  = req.query && req.query.pin;
  const pin = headerPin || bodyPin || queryPin;
  if (!pin || pin !== USER_PIN) return fail(res, 401, 'Invalid PIN');
  next();
};

// (Defined for future use if we normalize phone numbers server-side)
const normalizePhone = (s) => (s || '').replace(/[\s().-]/g, '');

// 🛡️ Light rate limiting on sensitive routes (adjust as needed)
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,             // 60 req/min per IP
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(['/sync', '/latest'], limiter);

// 🚀 ADA × NovaCircuit — Intergalactic Dev Crew (IDC)
// Story-driven /ping endpoint (Mission 01: Orion-5 Pulsar)
app.get('/ping', (_req, res) => {
  const now = new Date();

  const payload = {
    ok: true,
    message:
      'Built with cosmic precision by ADA × NovaCircuit — Intergalactic Dev Crew 🚀✨',
    mission:
      'Stardate 4257.2 — We detected pulsar readings from Orion-5. Our first landing! Beaming back contact logs on the native creatures’ bioluminescent communication. They responded with glowing patterns that spelled “hello” in pulses. Awaiting next signal.',
    chapter: 'Mission 01: Orion-5',
    timestamp: now.toISOString(),
  };

  // 🕵️ Hidden breadcrumbs for devs (subtle; not visible in normal UI)
  res.setHeader('X-IDC-Sector', 'Orion-5');
  res.setHeader('X-IDC-Token-Fragment', 'Δ9Q'); // carry-over fragment to next IDC app
  res.setHeader('X-IDC-Node', 'relay-alpha');

  return res.json(payload);
});

// Save contacts snapshot
app.post('/sync', requirePin, async (req, res) => {
  const contacts = req.body.contacts || [];
  try {
    const { error } = await supabase
      .from('contact_snapshots')
      .insert([{ pin: USER_PIN, contacts }]);

    if (error) throw error;
    res.json({ ok: true, count: contacts.length });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

// Retrieve latest contacts snapshot
app.get('/latest', requirePin, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('contact_snapshots')
      .select('contacts')
      .eq('pin', USER_PIN)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    if (!data || !data.length) return fail(res, 404, 'No contacts found');

    const contacts = data[0].contacts || [];
    res.json({ ok: true, contacts, count: contacts.length });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Contacts backend listening on http://localhost:${PORT}`);
  if (isProd) {
    console.log(
      `CORS (prod) allowing: ${allowedOrigins.length ? allowedOrigins.join(', ') : '[none set — consider ALLOWED_ORIGINS]'}`
    );
  } else {
    console.log('CORS (dev): allowing all origins');
  }
});

