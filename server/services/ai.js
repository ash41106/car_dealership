'use strict';
/**
 * AI helpers. Deterministic offline heuristics always work. If ANTHROPIC_API_KEY is set, the *Async variants try Claude
 * (model claude-sonnet-5-5, 8s timeout) and fall back to heuristics on any error. All output is "AI-generated - review before use".
 */
const { q } = require('../lib/db');
const { parseJson } = require('../lib/util');

const MODEL = 'claude-sonnet-5-5';
const DISCOUNT_RE = /(discount|offers?|deals?|cash\s?back|scheme|waiver|rebate|freebie|free gift|best price|lowest price|special price|price drop|[\d.,]+\s*%\s*(off)?|\boff\b|₹\s*[\d,.]+|rs\.?\s*[\d,.]+|inr\s*[\d,.]+|\b\d+(\.\d+)?\s*(lakh|lac|lakhs|crore)\b|on-?road (price|amount))/i;

function containsDiscountLanguage(text) { return DISCOUNT_RE.test(String(text || '')); }

/** Remove any sentence containing discount / offer / amount language. */
function stripDiscountLanguage(text) {
  const parts = String(text || '').split(/(?<=[.!?\n])\s+/);
  return parts.filter(s => !DISCOUNT_RE.test(s)).join(' ').replace(/\s{2,}/g, ' ').trim();
}

function leadContext(lead) {
  const model = lead.model_id ? (q.get('SELECT name FROM models WHERE id = ?', lead.model_id) || {}).name : null;
  const used = lead.used_id ? q.get('SELECT stock_id, model, variant, year FROM used_cars WHERE id = ?', lead.used_id) : null;
  return { model, used };
}

function parseBudget(text) {
  const t = String(text || '').toLowerCase();
  let m = t.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:lakh|lac|l\b)/);
  if (m) return `${m[1]}-${m[2]} lakh`;
  m = t.match(/(\d+(?:\.\d+)?)\s*(lakh|lac|l\b|crore|cr\b)/);
  if (m) return `${m[1]} ${/cr/.test(m[2]) ? 'crore' : 'lakh'}`;
  m = t.match(/(?:₹|rs\.?|inr)\s*([\d,]{5,})/);
  return m ? `₹${m[1]}` : null;
}
function parseTimeline(text) {
  const t = String(text || '').toLowerCase();
  if (/(today|tomorrow|immediately|asap|urgent|this week|right away)/.test(t)) return 'immediate (this week)';
  let m = t.match(/(?:within|in|next)\s*(\d+)?\s*(day|week|month)s?/);
  if (m) return m[1] ? `within ${m[1]} ${m[2]}(s)` : `next ${m[2]}`;
  if (/(diwali|festival|wedding|navratri)/.test(t)) return 'around festival season';
  return null;
}

function summarizeLead(lead) {
  const ctx = leadContext(lead);
  const text = [lead.message, lead.budget, lead.trade_in && typeof lead.trade_in === 'string' ? lead.trade_in : JSON.stringify(lead.trade_in || '')].join(' ');
  const needs = [];
  const t = text.toLowerCase();
  for (const [re, label] of [[/family|kids|7.?seat|seven/, 'family / space'], [/mileage|fuel economy|efficien/, 'fuel efficiency'], [/automatic|\bat\b|amt/, 'automatic gearbox'], [/cng/, 'CNG'], [/diesel/, 'diesel'],
    [/loan|finance|emi/, 'finance support'], [/exchange|trade.?in|old car|sell my/, 'exchange / trade-in'], [/highway|long drive/, 'highway use'], [/city|daily|commute/, 'city commute'], [/test drive/, 'test drive']]) {
    if (re.test(t)) needs.push(label);
  }
  if (lead.type === 'trade_in' && !needs.includes('exchange / trade-in')) needs.push('exchange / trade-in');
  if (lead.type === 'finance' && !needs.includes('finance support')) needs.push('finance support');
  const budget = parseBudget(lead.budget) || parseBudget(lead.message);
  const timeline = parseTimeline(lead.message);
  const interest = ctx.used ? `Used ${ctx.used.year} ${ctx.used.model} ${ctx.used.variant} (${ctx.used.stock_id})` : ctx.model || null;
  let next;
  const overdue = !lead.first_response_at && lead.due_at && Date.now() > Date.parse(lead.due_at);
  if (lead.status === 'new') next = overdue ? 'Call immediately - 5-minute SLA breached; apologise and offer a test drive slot.' : 'Call within 5 minutes, confirm requirements and offer a test drive slot.';
  else if (lead.status === 'contacted') next = 'Send confirmation of discussion and propose a test drive.';
  else if (lead.status === 'test_drive') next = 'Follow up after the test drive; gather feedback and share the quotation.';
  else if (lead.status === 'negotiation') next = 'Share the written quotation, confirm finance/exchange details and close with a delivery date.';
  else next = 'No action needed; log reason and keep in nurture list.';
  return {
    needs, budget, timeline, model_interest: interest || 'not specified', next_best_action: next,
    text: `${lead.name || 'Customer'} ${interest ? `is interested in ${interest}` : 'has enquired (model not specified yet)'}${budget ? ` with a budget around ${budget}` : ''}${timeline ? `, timeline ${timeline}` : ''}${needs.length ? `. Needs: ${needs.join(', ')}` : ''}. Next: ${next}`,
    source: 'heuristic', generated_by: 'AI-generated - review before use',
  };
}

function draftReply(lead, lang = 'en') {
  const ctx = leadContext(lead);
  const what = ctx.used ? `${ctx.used.model} ${ctx.used.variant}` : ctx.model || 'our cars';
  const name = (lead.name || '').split(' ')[0] || 'Sir/Madam';
  const text = lang === 'hi'
    ? `नमस्ते ${name}, Company A Motors में आपकी रुचि के लिए धन्यवाद। मैं ${what} के बारे में आपकी मदद करना चाहूंगा/चाहूंगी। क्या आज या कल टेस्ट ड्राइव के लिए कोई समय ठीक रहेगा? कृपया अपना सुविधाजनक समय बताएं।`
    : `Hello ${name}, thank you for your interest in ${what} at Company A Motors. I would be glad to help you with details and arrange a test drive. Could you tell me a convenient time today or tomorrow to speak?`;
  return stripDiscountLanguage(text);
}

/** Used-car price band from past_sales: same model, year +/-1, km band; low/high = 25th/75th percentile, mid = median. */
function suggestUsedPrice(car) {
  const model = String(car.model || '');
  let rows = q.all('SELECT * FROM past_sales WHERE lower(model) = lower(?) AND year BETWEEN ? AND ?', model, car.year - 1, car.year + 1);
  let basis = 'same model, year ±1';
  for (const band of [15000, 30000]) {
    const near = rows.filter(r => Math.abs(r.km - car.km) <= band);
    if (near.length >= 3) { rows = near; basis += `, km within ±${band.toLocaleString('en-IN')}`; break; }
  }
  if (!rows.length) return { low: null, mid: null, high: null, comps: 0, basis: 'no comparable past sales', generated_by: 'AI-generated - review before use' };
  const prices = rows.map(r => r.sold_price).sort((a, b) => a - b);
  const pct = p => { const i = (prices.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return prices[lo] + (prices[hi] - prices[lo]) * (i - lo); };
  const r5k = v => Math.round(v / 5000) * 5000;
  return { low: r5k(pct(0.25)), mid: r5k(pct(0.5)), high: r5k(pct(0.75)), comps: prices.length, basis, generated_by: 'AI-generated - review before use' };
}

async function callClaude(prompt, maxTokens = 400) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return (j.content || []).map(c => c.text || '').join('').trim() || null;
  } catch { return null; }
}

async function summarizeLeadAsync(lead) {
  const base = summarizeLead(lead);
  const out = await callClaude(`Summarise this car-dealership lead in 2 sentences for a sales consultant (needs, budget, timeline, model interest, next best action). Do not invent facts.\n${JSON.stringify({ name: lead.name, source: lead.source, message: lead.message, budget: lead.budget, status: lead.status })}`);
  return out ? { ...base, text: out, source: 'claude' } : base;
}
async function draftReplyAsync(lead, lang = 'en') {
  const base = draftReply(lead, lang);
  const out = await callClaude(`Write a short, warm WhatsApp reply (${lang === 'hi' ? 'Hindi' : 'English'}) from a car dealership consultant to this lead. NEVER mention discounts, offers, percentages, prices or amounts. Invite a test drive.\n${JSON.stringify({ name: lead.name, message: lead.message })}`);
  const f = out ? stripDiscountLanguage(out) : '';
  return f.length > 20 ? f : base;
}

module.exports = { summarizeLead, draftReply, suggestUsedPrice, summarizeLeadAsync, draftReplyAsync, containsDiscountLanguage, stripDiscountLanguage, MODEL };
