'use strict';
/** Messaging adapter. Provider "mock" only logs; swap by setting MESSAGING_PROVIDER and implementing send(). Opt-out always honoured. */
const { q } = require('../lib/db');
const { nowIso, randomId } = require('../lib/util');

const BRAND = 'Company A Motors';
const TEMPLATES = {
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

const providers = {
  mock: {
    send({ phone, channel, body }) {
      if (process.env.MSG_LOG !== '0' && process.env.LOG !== '0') console.log(`[msg:mock] ${channel} -> ${phone.slice(0, 2)}******${phone.slice(-2)}: ${body.slice(0, 80)}`);
      return { ok: true, id: 'mock-' + randomId(4) };
    },
  },
};
function provider() { return providers[process.env.MESSAGING_PROVIDER || 'mock'] || providers.mock; }

function isOptedOut(phone) {
  return !!q.get('SELECT 1 x FROM optouts WHERE phone = ?', phone) || !!q.get('SELECT 1 x FROM leads WHERE phone = ? AND opted_out = 1 LIMIT 1', phone);
}

function deliver({ leadId, phone, channel, template, lang, body, userId }) {
  if (isOptedOut(phone)) {
    const r = q.run('INSERT INTO messages(lead_id,phone,channel,template,lang,body,direction,status,user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      leadId, phone, channel, template, lang, body, 'out', 'blocked_optout', userId, nowIso());
    return { id: Number(r.lastInsertRowid), status: 'blocked_optout' };
  }
  const r = q.run('INSERT INTO messages(lead_id,phone,channel,template,lang,body,direction,status,user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    leadId, phone, channel, template, lang, body, 'out', 'queued', userId, nowIso());
  const id = Number(r.lastInsertRowid);
  let res;
  try { res = provider().send({ phone, channel, body }); } catch (e) { res = { ok: false }; }
  q.run('UPDATE messages SET status = ?, provider_id = ? WHERE id = ?', res.ok ? 'sent' : 'failed', res.id || null, id);
  return { id, status: res.ok ? 'sent' : 'failed' };
}

/** Queue a templated message (WhatsApp by default). */
function sendTemplate({ leadId = null, phone, template, lang = 'en', vars = {}, channel = 'whatsapp' }) {
  return deliver({ leadId, phone, channel, template, lang, body: render(template, lang, vars), userId: null });
}
/** Free-text reply typed/confirmed by staff. */
function sendText({ leadId, phone, text, channel = 'whatsapp', userId }) {
  return deliver({ leadId, phone, channel, template: null, lang: null, body: text, userId });
}

module.exports = { TEMPLATES, render, sendTemplate, sendText, isOptedOut };
