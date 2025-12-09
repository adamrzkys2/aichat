// server/index.js (ESM version — paste & replace)
import express from 'express';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(bodyParser.json());

const PORT = 5174; // gunakan 5174 agar tidak bentrok dengan Vite 5173
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_URL = process.env.GEMINI_API_URL || '';
const ALWAYS_INCLUDE_COMPANY = String(process.env.ALWAYS_INCLUDE_COMPANY || 'false').toLowerCase() === 'true';

if (!GEMINI_API_KEY) console.warn('Warning: GEMINI_API_KEY not set.');
if (!GEMINI_API_URL) console.warn('Warning: GEMINI_API_URL not set.');

let company = null;
const COMPANY_PATH = path.join(process.cwd(), 'server', 'data', 'company.json');

function loadCompany() {
  try {
    if (fs.existsSync(COMPANY_PATH)) {
      const raw = fs.readFileSync(COMPANY_PATH, 'utf8');
      company = JSON.parse(raw);
      console.log('Loaded company.json:', company.name || '(unnamed)');
    } else {
      company = null;
      console.log('No company.json found at', COMPANY_PATH);
    }
  } catch (err) {
    console.warn('Could not load company.json:', err.message);
    company = null;
  }
}
loadCompany();

function companySummary(obj) {
  if (!obj) return '';
  const parts = [];
  if (obj.name) parts.push(`Name: ${obj.name}`);
  if (obj.aliases && obj.aliases.length) parts.push(`Aliases: ${obj.aliases.join(', ')}`);
  if (obj.website) parts.push(`Website: ${obj.website}`);
  if (obj.description) parts.push(`Description: ${obj.description}`);
  if (obj.products && obj.products.length) parts.push(`Products/Services: ${obj.products.join(', ')}`);
  if (obj.location) parts.push(`Location: ${obj.location}`);
  return parts.join('\n');
}

function isRelevantToCompany(message, companyObj) {
  if (!companyObj || !message) return false;
  const text = message.toLowerCase();
  const candidates = [];
  if (companyObj.name) candidates.push(companyObj.name.toLowerCase());
  if (companyObj.aliases && Array.isArray(companyObj.aliases)) candidates.push(...companyObj.aliases.map(a => a.toLowerCase()));
  if (companyObj.products && Array.isArray(companyObj.products)) candidates.push(...companyObj.products.map(p => p.toLowerCase()));
  if (companyObj.description) {
    const words = companyObj.description.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    candidates.push(...words.slice(0, 20));
  }
  for (const c of candidates) {
    if (!c) continue;
    if (text.includes(c)) return true;
  }
  return false;
}

app.post('/api/reload-company', (req, res) => {
  loadCompany();
  res.json({ ok: true, loaded: !!company, name: company?.name || null });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: '`message` is required' });

    if (!GEMINI_API_URL || !GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Server not configured: GEMINI_API_URL and/or GEMINI_API_KEY missing. Set them in .env' });
    }

    const messages = [];
    let includeCompany = ALWAYS_INCLUDE_COMPANY;
    if (!includeCompany && company) includeCompany = isRelevantToCompany(message, company);

    if (includeCompany && company) {
      const ctx = `You are Tech-C Bot. Use ONLY the information below about the company to answer user questions about Tech-C. If the user asks about prices, list available packages exactly as stated. If the information is not present, say "Maaf, informasi harga belum tersedia; silakan hubungi 0877-1020-8101 atau kunjungi https://www.tech-c.my.id"`;
      messages.push({ role: 'system', content: ctx });
    }

    messages.push({ role: 'user', content: message });// ---- REPLACEMENT BLOCK: generation with retry + robust extraction ----
const contents = [];

// include company context if needed
if (includeCompany && company) {
  contents.push({
    parts: [{ text: `Company profile (for context):\n${companySummary(company)}\n\nUse this information when answering questions about the company.` }]
  });
}
contents.push({ parts: [{ text: message }] });

// retry strategy
const initialMax = 512;
const maxLimit = 2048; // adjust based on model limits and cost
let currentMax = initialMax;
let upstreamJson = null;
let upstreamRaw = null;
let attempts = 0;
const maxAttempts = 3;

while (attempts < maxAttempts) {
  attempts++;
  const body = {
    contents,
   generationConfig: {
  maxOutputTokens: 8192,
  temperature: 0.6,
  candidateCount: 1
}
  };

  // send request
  const upstream = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY
    },
    body: JSON.stringify(body),
  });

  upstreamRaw = await upstream.text().catch(() => null);
  try {
    upstreamJson = upstreamRaw ? JSON.parse(upstreamRaw) : null;
  } catch (e) {
    upstreamJson = null;
  }

  // Log raw response for debug (remove in production)
  console.log('GENERATION attempt', attempts, 'maxOutputTokens=', currentMax);
  console.log('RAW RESPONSE:', upstreamRaw);

  if (!upstream.ok) {
    // return upstream error early (includes details)
    return res.status(502).json({ error: 'Upstream error', status: upstream.status, details: upstreamRaw });
  }

  // If response contains candidates with text, break early
  const hasText = upstreamJson &&
    Array.isArray(upstreamJson.candidates) &&
    upstreamJson.candidates.length &&
    upstreamJson.candidates[0]?.content?.parts &&
    upstreamJson.candidates[0].content.parts.some(p => p?.text);

  // if model produced text, stop retrying
  if (hasText) break;

  // if model finished because of MAX_TOKENS, increase maxOutputTokens and retry
  const finishReason = upstreamJson?.candidates?.[0]?.finishReason;
  if (finishReason === 'MAX_TOKENS' && currentMax < maxLimit) {
    // increase by factor (or set fixed next value)
    currentMax = Math.min(maxLimit, currentMax * 2); // e.g. 512 -> 1024 -> 2048
    // continue loop to retry
    continue;
  }

  // If no useful text and not a MAX_TOKENS finish, stop retrying
  break;
}

// Now extract reply robustly
let reply = '(no reply)';
if (upstreamJson) {
  if (Array.isArray(upstreamJson.candidates) && upstreamJson.candidates.length) {
    const cand = upstreamJson.candidates[0];
    // prefer parts[].text, fallback to any other text fields
    if (cand?.content?.parts && cand.content.parts.some(p => p.text)) {
      reply = cand.content.parts.map(p => p.text || '').filter(Boolean).join('\n');
    } else if (cand.output_text) {
      reply = cand.output_text;
    } else {
      // final fallback: stringify candidate to help debugging
      reply = JSON.stringify(cand).slice(0, 2000);
    }

    // helpful hint if model hit max tokens
    if (cand.finishReason === 'MAX_TOKENS') {
      reply = `(Reply truncated — model hit token limit.)\n\n` + reply;
    }
  } else if (upstreamJson.output_text) {
    reply = upstreamJson.output_text;
  } else {
    reply = JSON.stringify(upstreamJson).slice(0, 2000);
  }
} else {
  // upstreamJson is null — include raw body in response for debugging
  reply = upstreamRaw ? `Upstream returned non-JSON response: ${upstreamRaw}` : '(empty upstream response)';
}

return res.json({ reply, includedCompany: !!includeCompany, attempts, usedMaxOutputTokens: currentMax });

  } catch (err) {
    console.error('Server error in /api/chat:', err);
    return res.status(500).json({ error: String(err) });
  }
});

app.use(express.static('dist'));

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
