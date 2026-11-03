'use strict';
/** Messaging adapter. Provider "mock" only logs; swap by setting MESSAGING_PROVIDER and implementing send(). Opt-out always honoured. */
const { q } = require('../lib/db');
const { nowIso, randomId } = require('../lib/util');

const BRAND = 'Company A Motors';
const TEMPLATES = {
  otp: {
    en: 'Your Company A Motors verification code is {otp}. It is valid for 5 minutes. Do not share it with anyone.',
    hi: 'आपका Company A Motors सत्यापन कोड {otp} है। यह 5 मिनट के लिए मान्य है। इसे किसी के साथ साझा न करें।',
  },
  ack_lead: {
    en: 'Hi {name}, thank you for contacting ' + BRAND + '. {consultant} will call you within 5 minutes. Reply STOP to opt out.',
    hi: 'नमस्ते {name}, ' + BRAND + ' से संपर्क करने के लिए धन्यवाद। {consultant} 5 मिनट में आपको कॉल करेंगे। बंद करने के लिए STOP लिखें।',
  },
  test_drive_confirm: {
    en: 'Hi {name}, your test drive of {model} is booked at {place} on {date} at {time}. Please carry your driving licence. Reply STOP to opt out.',
    hi: 'नमस्ते {name}, {model} की टेस्ट ड्राइव {place} में {date} को {time} बजे बुक हो गई है। कृपया ड्राइविंग लाइसेंस साथ लाएं। बंद करने के लिए STOP लिखें।',
  },
  service_confirm: {
    en: 'Hi {name}, your service booking at {place} on {date} at {time} is confirmed. Reply STOP to opt out.',
    hi: 'नमस्ते {name}, {place} में {date} को {time} बजे आपकी सर्विस बुकिंग की पुष्टि हो गई है। बंद करने के लिए STOP लिखें।',
  },
  followup: {
    en: 'Hi {name}, this is {consultant} from ' + BRAND + '. Happy to help with your {model} enquiry. When is a good time to talk?',
    hi: 'नमस्ते {name}, मैं {consultant}, ' + BRAND + ' से। आपकी {model} पूछताछ में मदद करके खुशी होगी। बात करने का सही समय बताएं।',
  },
};

function render(tpl, lang, vars = {}) {
  const t = (TEMPLATES[tpl] || {})[lang === 'hi' ? 'hi' : 'en'];
  if (!t) throw new Error('Unknown template ' + tpl);
  return t.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''));
}

/**
 * Providers (select with MESSAGING_PROVIDER=mock|http).
 *  mock: logs only.
 *  http: generic JSON POST gateway adapter, configured purely by env:
 *    MESSAGING_URL            gateway endpoint (required)
 *    MESSAGING_TOKEN          secret; sent as `<MESSAGING_AUTH_HEADER>: <MESSAGING_AUTH_SCHEME> <token>` (defaults: Authorization / Bearer; scheme '' = raw token)
 *    MESSAGING_HEADERS        optional JSON of extra static headers (e.g. {"authkey":"..."} for MSG91-style gateways)
 *    SENDER_ID                sender / DLT header
 *    DLT_ENTITY_ID            DLT principal entity id
 *    DLT_TEMPLATE_IDS         JSON map template name -> DLT template id, e.g. {"otp":"1107...","ack_lead":"1107..."}
 *    MESSAGING_BODY_TEMPLATE  optional JSON body with {{placeholders}} to match a gateway schema. Placeholders:
 *                             {{to}} (91XXXXXXXXXX) {{to10}} {{message}} {{sender}} {{template}} {{template_id}} {{entity_id}} {{channel}} {{lang}} {{otp}}
 *    MESSAGING_TIMEOUT_MS     default 8000
 *  Default body when no template is given:
 *    {"to":"91XXXXXXXXXX","channel":"sms|whatsapp","sender":SENDER_ID,"message":text,"template":name,"template_id":DLT id,"entity_id":DLT_ENTITY_ID,"lang":"en|hi"}
 *  Success = HTTP 2xx. Example mapping: MESSAGING_BODY_TEMPLATE={"template_id":"{{template_id}}","recipients":[{"mobiles":"{{to}}","otp":"{{otp}}"}]}
 */
function fill(node, vars) {
  if (typeof node === 'string') return node.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] === undefined || vars[k] === null ? '' : String(vars[k])));
  if (Array.isArray(node)) return node.map(n => fill(n, vars));
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, fill(v, vars)]));
  return node;
}
function jsonEnv(name, def) { try { return process.env[name] ? JSON.parse(process.env[name]) : def; } catch { return def; } }
const httpProvider = {
  configured: () => !!process.env.MESSAGING_URL,
  async send({ phone, channel, body, template, lang, vars }) {
    if (!process.env.MESSAGING_URL) return { ok: false, error: 'MESSAGING_URL not set' };
    const ids = jsonEnv('DLT_TEMPLATE_IDS', {});
    const v = { to: '91' + phone, to10: phone, message: body, sender: process.env.SENDER_ID || '', template: template || '', template_id: ids[template] || '', entity_id: process.env.DLT_ENTITY_ID || '', channel, lang: lang || 'en', otp: (vars && vars.otp) || '' };
    const tpl = jsonEnv('MESSAGING_BODY_TEMPLATE', null);
    const payload = tpl ? fill(tpl, v) : { to: v.to, channel, sender: v.sender, message: body, template: v.template, template_id: v.template_id, entity_id: v.entity_id, lang: v.lang };
    const headers = { 'content-type': 'application/json', ...jsonEnv('MESSAGING_HEADERS', {}) };
    if (process.env.MESSAGING_TOKEN) {
      const scheme = process.env.MESSAGING_AUTH_SCHEME === undefined ? 'Bearer' : process.env.MESSAGING_AUTH_SCHEME;
      headers[process.env.MESSAGING_AUTH_HEADER || 'Authorization'] = (scheme ? scheme + ' ' : '') + process.env.MESSAGING_TOKEN;
    }
    try {
      const r = await fetch(process.env.MESSAGING_URL, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(parseInt(process.env.MESSAGING_TIMEOUT_MS || '8000', 10)) });
      let j = null; try { j = await r.json(); } catch {}
      if (!r.ok) return { ok: false, error: 'gateway HTTP ' + r.status };
      return { ok: true, id: String((j && (j.message_id || j.id || j.request_id || j.messageId)) || 'http-' + randomId(4)) };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  },
};
const providers = {
  mock: {
    configured: () => true,
    send({ phone, channel, body }) {
      if (process.env.MSG_LOG !== '0' && process.env.LOG !== '0') console.log(`[msg:mock] ${channel} -> ${phone.slice(0, 2)}******${phone.slice(-2)}: ${body.slice(0, 80)}`);
      return { ok: true, id: 'mock-' + randomId(4) };
    },
  },
  http: httpProvider,
};
function providerName() { return process.env.MESSAGING_PROVIDER === 'http' ? 'http' : 'mock'; }
function provider() { return providers[providerName()]; }
/** Can real OTPs be delivered? In production only a configured non-mock provider counts (fail closed). */
function otpDeliverable() {
  if (process.env.NODE_ENV === 'production' && providerName() === 'mock') return { ok: false, reason: 'No SMS provider configured (set MESSAGING_PROVIDER=http and MESSAGING_URL)' };
  if (providerName() === 'http' && !httpProvider.configured()) return { ok: false, reason: 'MESSAGING_URL is not set' };
  return { ok: true };
}

function isOptedOut(phone) {
  return !!q.get('SELECT 1 x FROM optouts WHERE phone = ?', phone) || !!q.get('SELECT 1 x FROM leads WHERE phone = ? AND opted_out = 1 LIMIT 1', phone);
}

function deliver({ leadId, phone, channel, template, lang, body, userId, transactional, vars }) {
  const stored = template === 'otp' ? body.replace(/\d{6}/g, '******') : body;
  if (!transactional && isOptedOut(phone)) {
    const r = q.run('INSERT INTO messages(lead_id,phone,channel,template,lang,body,direction,status,user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      leadId, phone, channel, template, lang, stored, 'out', 'blocked_optout', userId, nowIso());
    return { id: Number(r.lastInsertRowid), status: 'blocked_optout' };
  }
  const r = q.run('INSERT INTO messages(lead_id,phone,channel,template,lang,body,direction,status,user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    leadId, phone, channel, template, lang, stored, 'out', 'queued', userId, nowIso());
  const id = Number(r.lastInsertRowid);
  const finish = res => { q.run('UPDATE messages SET status = ?, provider_id = ? WHERE id = ?', res.ok ? 'sent' : 'failed', res.id || null, id); return { id, status: res.ok ? 'sent' : 'failed', error: res.error }; };
  let res;
  try { res = provider().send({ phone, channel, body, template, lang, vars }); } catch (e) { res = { ok: false, error: String(e.message) }; }
  if (res && typeof res.then === 'function') {
    const promise = res.catch(e => ({ ok: false, error: String(e && e.message) })).then(finish);
    return { id, status: 'queued', promise }; // async gateway: await `promise` when delivery must be confirmed (OTP)
  }
  return finish(res);
}

/** Queue a templated message (WhatsApp by default). */
function sendTemplate({ leadId = null, phone, template, lang = 'en', vars = {}, channel = 'whatsapp', transactional = false }) {
  return deliver({ leadId, phone, channel, template, lang, body: render(template, lang, vars), userId: null, transactional, vars });
}
/** Free-text reply typed/confirmed by staff. */
function sendText({ leadId, phone, text, channel = 'whatsapp', userId }) {
  return deliver({ leadId, phone, channel, template: null, lang: null, body: text, userId });
}

module.exports = { TEMPLATES, render, sendTemplate, sendText, isOptedOut, otpDeliverable, providerName };
