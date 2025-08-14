// 🌌 Built with cosmic precision by ADA × NovaCircuit — Intergalactic Dev Crew (IDC)

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('express-rate-limit');

const pinAttempts = new Map();                 // CallSid -> count (MVP)
const MAX_VOICE_ATTEMPTS = Number(process.env.MAX_VOICE_ATTEMPTS || 5);

const app = express();

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN  || '';

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

const exposed = ["X-IDC-Sector", "X-IDC-Node", "X-IDC-Token-Fragment"];

app.use(
  cors({
    origin: isProd
      ? function (origin, callback) {
          // Allow non-browser clients (no Origin) like curl/Postman
          if (!origin) return callback(null, true);
          if (allowedOrigins.includes(origin)) return callback(null, true);
          return callback(
            new Error(`CORS blocked: ${origin} not in ALLOWED_ORIGINS`)
          );
        }
      : true, // dev: allow all
    credentials: false,                        // we're not using cookies
    exposedHeaders: exposed,                   // let the browser read custom headers
    allowedHeaders: ["Content-Type", "x-pin"], // allow our request header
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

// 🧱 JSON body limit (contacts can be sizable but bounded)
app.use(express.json({ limit: '1mb' }));

// 🔔 Twilio webhooks use application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));

// Light rate limit on all /voice webhooks
const voiceLimiter = rateLimit({ windowMs: 60_000, max: 30 });
app.use('/voice', voiceLimiter);

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

// --- Contact blocklist helpers (keep certain names out everywhere) ---
const normalizeName = (s = '') => s.toLowerCase().trim();
const BLOCKLIST_NAMES = new Set(['ada lovelace', 'nova circuit']);

const filterContacts = (arr = []) =>
  (arr || []).filter(
    (c) => !BLOCKLIST_NAMES.has(normalizeName(c?.name || ''))
  );

// 🛡️ Light rate limiting on sensitive routes (adjust as needed)
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,             // 60 req/min per IP
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(['/sync', '/latest'], limiter);

// 🚀 ADA × NovaCircuit — Intergalactic Dev Crew (IDC)
// Story-driven /ping endpoint (Mission 01: Orion-5)
app.get("/ping", (_req, res) => {
  const now = new Date();

  // Expose breadcrumb headers (ASCII only!)
  res.set({
    "X-IDC-Sector": "Orion-5",
    "X-IDC-Node": "Pulsar-Alpha",
    "X-IDC-Token-Fragment": "M01-ORION5",
  });

  const payload = {
    ok: true,
    message:
      "Built with cosmic precision by ADA × NovaCircuit — Intergalactic Dev Crew 🚀✨",
    mission:
      "Stardate 4257.2 — We detected pulsar readings from Orion-5. Our first landing! Beaming back contact logs on the native creatures’ bioluminescent communication. They responded with glowing patterns that spelled “hello” in pulses. Awaiting next signal.",
    chapter: "Mission 01: Orion-5",
    timestamp: now.toISOString(),
  };

  return res.json(payload);
});

// Save contacts snapshot
app.post('/sync', requirePin, async (req, res) => {
    const contacts = filterContacts(req.body.contacts || []);
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

    const contacts = filterContacts(data[0].contacts || []);
    res.json({ ok: true, contacts, count: contacts.length });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

// ──────────────────────────────
// IDC Voice Assistant (Twilio IVR)
// ──────────────────────────────

const callSessions = new Map(); // CallSid -> { phone, authed, contacts, last: { query, results } }

const twiml = (inner) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
const say   = (text) => `<Say voice="alice">${text}</Say>`;
const gather = (attrs, inner = '') => `<Gather ${attrs}>${inner}</Gather>`;
const hangup = () => `<Hangup/>`;
const pause  = (len = 1) => `<Pause length="${len}"/>`;
const speakDigits = (s = '') => (s || '').replace(/\D/g, '').split('').join(' ');
const firstN = (arr, n = 3) => arr.slice(0, n);
const normalizeToDigits = (s = '') => (s || '').replace(/[^\d+]/g, '');

function searchContacts(contacts, qRaw) {
  const q = (qRaw || '').toLowerCase().trim();
  if (!q) return [];
  const scored = contacts.map((c) => {
    const name = (c.name || '').toLowerCase();
    const nums = (c.phoneNumbers || []).map(p => (p.number || '').toLowerCase()).join(' ');
    let score = 0;
    if (name.includes(q)) score += 3;
    if (nums.includes(q)) score += 1;
    return { c, score };
  }).filter(x => x.score > 0).sort((a,b)=>b.score-a.score);
  return scored.map(x => x.c);
}

// Entry: menu (1 = voicemail, 2 = admin)
app.post('/voice/answer', (req, res) => {
  callSessions.delete(req.body?.CallSid);
    pinAttempts.delete(req.body?.CallSid);
  const xml = twiml(
    say('Welcome to Intergalactic Contacts.') +
    gather('input="dtmf" numDigits="1" action="/voice/menu" method="POST" timeout="6"',
      say('Press 1 to leave a voicemail. Press 2 for secure access.')
    ) +
    say('Sorry, I did not receive any input.') +
    `<Redirect method="POST">/voice/answer</Redirect>`
  );
  res.type('text/xml').send(xml);
});

// Branch from menu
app.post('/voice/menu', (req, res) => {
  const d = (req.body?.Digits || '').trim();

  if (d === '1') {
    const xml = twiml(
      say('Please leave a message after the beep. Press pound when finished.') +
      `<Record maxLength="120" playBeep="true" finishOnKey="#" action="/voice/voicemail_done" method="POST" />` +
      say('No message recorded. Goodbye.') + hangup()
    );
    return res.type('text/xml').send(xml);
  }

  if (d === '2') {
    const xml = twiml(
      say('Please say your phone number, or enter it now.') +
      gather('input="speech dtmf" numDigits="15" action="/voice/phone" method="POST" timeout="7" speechTimeout="auto" speechModel="phone_call"', '') +
      say('Sorry, I did not catch that.') +
      `<Redirect method="POST">/voice/answer</Redirect>`
    );
    return res.type('text/xml').send(xml);
  }

  res.type('text/xml').send(twiml(say('Sorry, I did not get that.') + `<Redirect method="POST">/voice/answer</Redirect>`));
});

// Capture phone → ask for PIN
app.post('/voice/phone', (req, res) => {
  const { CallSid, Digits, SpeechResult } = req.body || {};
    const phone = normalizeToDigits(Digits || SpeechResult || '');
  if (!phone) {
    return res.type('text/xml').send(twiml(say('I did not receive a valid number.') + `<Redirect method="POST">/voice/answer</Redirect>`));
  }
  callSessions.set(CallSid, { phone, authed: false, contacts: [], last: null });
  const xml = twiml(
    say('Thank you. Now enter your six digit PIN, or say your PIN after the tone.') +
    gather('input="dtmf speech" numDigits="6" action="/voice/pin" method="POST" timeout="6" speechTimeout="auto"', '') +
    `<Redirect method="POST">/voice/answer</Redirect>`
  );
  res.type('text/xml').send(xml);
});

// Verify PIN → load contacts → prompt for search
app.post('/voice/pin', async (req, res) => {
  const { CallSid, Digits, SpeechResult } = req.body || {};
  const provided = (Digits || SpeechResult || '').replace(/\D/g, '');
  const expected = process.env.USER_PIN || '123456';

  // track bad attempts per CallSid
  if (!provided || provided !== expected) {
    const attempts = (pinAttempts.get(CallSid) || 0) + 1;
    pinAttempts.set(CallSid, attempts);
    if (attempts >= MAX_VOICE_ATTEMPTS) {
      pinAttempts.delete(CallSid);
      callSessions.delete(CallSid);
      return res.type('text/xml').send(
        twiml(say('Too many attempts. Goodbye.') + '<Hangup/>')
      );
    }
    return res.type('text/xml').send(
      twiml(say('Invalid PIN.') + '<Redirect method="POST">/voice/answer</Redirect>')
    );
  }

  // success: reset counter
  pinAttempts.delete(CallSid);

  const sess = callSessions.get(CallSid) || { authed: false, contacts: [], last: null };

  try {
    const { data, error } = await supabase
      .from('contact_snapshots')
      .select('contacts')
      .eq('pin', expected)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;

    const contacts = filterContacts(data?.[0]?.contacts || []);
    if (!contacts.length) {
      return res.type('text/xml').send(
        twiml(say('No contacts are backed up yet. Please open the app and run backup first.') + hangup())
      );
    }

    sess.authed = true;
    sess.contacts = contacts;
    callSessions.set(CallSid, sess);

    const hints = firstN(contacts, 50)
      .map(c => (c.name || '').replace(/["<>]/g, '')) // sanitize
      .filter(Boolean)
      .join(',');

    const xml = twiml(
      say('Authenticated.') +
      say('Say the name of the contact you need.') +
      gather(`input="speech dtmf" action="/voice/search" method="POST" timeout="7" speechTimeout="auto" speechModel="phone_call" speechHints="${hints}"`, '')
    );
    return res.type('text/xml').send(xml);
  } catch {
    return res.type('text/xml').send(
      twiml(say('System error loading your contacts. Please try again later.') + hangup())
    );
  }
});

/// Take speech, search, offer top matches
app.post('/voice/search', (req, res) => {
  const { CallSid, SpeechResult } = req.body || {};
  const sess = callSessions.get(CallSid);

  // If session died, restart at the main menu
  if (!sess?.authed) {
    return res.type('text/xml').send(
      twiml(say('Session expired.') + `<Redirect method="POST">/voice/answer</Redirect>`)
    );
  }

  const results = firstN(searchContacts(sess.contacts, SpeechResult), 3);

  // If no matches, send them back to the name prompt (menu), not PIN
  if (!results.length) {
    return res.type('text/xml').send(
      twiml(
        say(`I could not find any contact matching ${SpeechResult || 'that'}.`) +
        `<Redirect method="POST">/voice/menu</Redirect>`
      )
    );
  }

  sess.last = { query: SpeechResult, results };
  callSessions.set(CallSid, sess);

  const menu = results.map((c, i) => `${i + 1}. ${c.name}`).join('. ');
  const xml = twiml(
    say(`I found ${results.length}. ${menu}.`) +
    say('Say one, two, or three to hear the number. Or say repeat to hear them again.') +
    gather('input="speech dtmf" action="/voice/select" method="POST" timeout="6" speechTimeout="auto"', '')
  );
  res.type('text/xml').send(xml);
});

// Handle selection and read number
app.post('/voice/select', (req, res) => {
  const { CallSid, Digits, SpeechResult } = req.body || {};
  const sess = callSessions.get(CallSid);
  if (!sess?.authed || !sess?.last?.results?.length) {
    return res.type('text/xml').send(twiml(`<Redirect method="POST">/voice/answer</Redirect>`));
  }

  const phrase = (SpeechResult || '').toLowerCase();
  let idx = null;
  if (/^(one|1)\b/.test(phrase) || Digits === '1') idx = 0;
  else if (/^(two|2)\b/.test(phrase) || Digits === '2') idx = 1;
  else if (/^(three|3)\b/.test(phrase) || Digits === '3') idx = 2;
  else if (/repeat/.test(phrase)) {
    const menu = sess.last.results.map((c, i) => `${i + 1}. ${c.name}`).join('. ');
    return res.type('text/xml').send(twiml(
      say(menu) + gather('input="speech dtmf" action="/voice/select" method="POST" timeout="6"', '')
    ));
  }

  if (idx == null || !sess.last.results[idx]) {
    return res.type('text/xml').send(twiml(say('Sorry, I did not get that.') + `<Redirect method="POST">/voice/search</Redirect>`));
  }

  const chosen = sess.last.results[idx];
  const num = (chosen.phoneNumbers?.[0]?.number || '').trim();
  if (!num) {
    return res.type('text/xml').send(twiml(
      say(`I do not have a number for ${chosen.name}. Please try another contact.`) +
      `<Redirect method="POST">/voice/pin</Redirect>`
    ));
  }

  const xml = twiml(
    say(`The number for ${chosen.name} is:`) + pause(1) + say(speakDigits(num)) + pause(1) +
    say('Would you like another contact?') +
    gather('input="speech dtmf" action="/voice/menu" method="POST" timeout="6" speechTimeout="auto"', '')
  );
  res.type('text/xml').send(xml);
});

// Voicemail finished
app.post('/voice/voicemail_done', (req, res) => {
  const { From, To, RecordingUrl, RecordingDuration } = req.body || {};
  console.log('[IDC:VM]', { From, To, RecordingUrl, RecordingDuration });
  res.type('text/xml').send(twiml(say('Thanks. Your message has been recorded. Goodbye.') + hangup()));
});

// Stream voicemail audio (PIN-gated)
// - If mirrored to Supabase Storage, redirect to a signed URL.
// - Else, proxy Twilio .mp3 using server-side credentials.
app.get('/voicemails/:id/stream', requirePin, async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('voicemails')
      .select('storage_path, twilio_recording_url')
      .eq('user_pin', USER_PIN)
      .eq('id', id)
      .single();

    if (error || !data) return fail(res, 404, 'Not found');

    // Prefer Supabase Storage (private)
    if (data.storage_path) {
      const { data: signed, error: sErr } = await supabase
        .storage.from('voicemails')
        .createSignedUrl(data.storage_path, 60);
      if (sErr) return fail(res, 500, sErr.message);
      return res.redirect(signed.signedUrl);
    }

    // Fallback: fetch from Twilio Recordings API and stream
    if (data.twilio_recording_url && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      const mp3Url = data.twilio_recording_url.endsWith('.mp3')
        ? data.twilio_recording_url
        : `${data.twilio_recording_url}.mp3`;
      const basic = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

      const upstream = await fetch(mp3Url, { headers: { Authorization: `Basic ${basic}` } });
      if (!upstream.ok) return fail(res, 502, `Twilio fetch ${upstream.status}`);

      res.set('Content-Type', 'audio/mpeg');
      const arrayBuffer = await upstream.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));
    }

    return fail(res, 404, 'No audio available');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// -- Boot the server (keep at bottom) --
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
    
    // List voicemails for this PIN (MVP)
    app.get('/voicemails', requirePin, async (_req, res) => {
      try {
        const { data, error } = await supabase
          .from('voicemails')
          .select('id, from, to, seconds, created_at')
          .eq('user_pin', USER_PIN)
          .order('created_at', { ascending: false })
          .limit(100);
        if (error) throw error;
        res.json({ ok: true, items: data || [] });
      } catch (e) {
        // safe fallback so the app still renders an empty list
        res.json({ ok: true, items: [] });
      }
    });

    
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
}
module.exports = app;

