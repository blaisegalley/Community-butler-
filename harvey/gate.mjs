// Harvey's pre-send gate: plain checks, no model involved.
//
// Every email Harvey puts in the Desk outbox must pass checkEmail(). The Desk
// loads this same file and re-runs it after you edit an email, so the rules
// live in one place. Run it from the command line with:
//
//   node harvey/gate.mjs '{"to":"a@b.com","subject":"...","body":"...","step":1,"track":"A"}'
//
// It prints the result as JSON and exits 1 if anything failed. Pass a JSON
// array to check several emails at once.

export const WORD_LIMITS = { 1: 75, 2: 60, 3: 40, reply: 150 };
export const MAX_SUBJECT = 60;
export const WEBSITE_PRICE = { min: 700, max: 1250 };

// Spam triggers, AI tells, and the hype words product_knowledge.md bans.
export const BANNED_PHRASES = [
  'act now', 'buy now', 'click here', 'limited time', 'special offer', 'risk-free',
  'no obligation', '100% free', 'guaranteed', 'guarantee', 'winner', 'congratulations',
  'hope this finds you well', 'hope this email finds you', 'i wanted to reach out',
  'just wanted to', 'reaching out because', 'circling back', 'just following up',
  'touching base', 'picture this', 'imagine if', 'what if i told you', "in today's",
  'game-changer', 'game changer', 'game-changing', 'revolutionary', 'revolutionize',
  'cutting-edge', 'leverage', 'synergy', 'unlock', 'supercharge', 'no pressure',
  'as an ai', "i'm an ai", 'i am an ai', 'language model',
];

// Opt-out wording. Any of these in a reply means stop, permanently.
export const OPT_OUT_PATTERNS = [
  /\bunsubscribe\b/i, /\bremove me\b/i, /\btake me off\b/i, /\bstop (emailing|contacting|messaging)\b/i,
  /\bdo not (email|contact)\b/i, /\bdon'?t (email|contact) me\b/i, /\bno thanks\b/i,
  /\bnot interested\b/i, /^\s*stop\s*\.?\s*$/i, /\bleave me alone\b/i,
];

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const MERGE_TAG_RE = /\{\{[^}]*\}\}|\{[A-Za-z_ ]+\}|\[(first name|name|company|business|town|agent|owner)[^\]]*\]/i;
const URL_RE = /https?:\/\/\S+/gi;
const HTML_RE = /<\s*\/?\s*(html|body|div|p|br|table|img|a|span|b|strong|i|em)\b/i;
const MARKDOWN_RE = /(^|\n)\s*([-*•]\s|\d+\.\s|#{1,6}\s)|\*\*[^*]+\*\*/;
const DOLLAR_RE = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;

export function countWords(text) {
  const t = (text || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

export function isOptOut(text) {
  return OPT_OUT_PATTERNS.some((re) => re.test(text || ''));
}

export function emailKey(email) {
  return (email || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

/**
 * @param {object} email
 * @param {string} email.to
 * @param {string} email.subject
 * @param {string} email.body      the message without the signature footer (the Desk adds that)
 * @param {1|2|3|'reply'} email.step
 * @param {'A'|'B'} email.track    A = real estate agents (Butler jobs), B = small businesses (websites)
 * @param {string} [email.prospectEmail]  the address on the prospect record; must match `to`
 * @param {string[]} [email.optedOut]     addresses that asked not to be contacted
 * @returns {{ok: boolean, reasons: string[], words: number}}
 */
export function checkEmail(email) {
  const reasons = [];
  const to = (email.to || '').trim().toLowerCase();
  const subject = (email.subject || '').trim();
  const body = (email.body || '').trim();
  const step = email.step ?? 1;
  const words = countWords(body);

  if (!EMAIL_RE.test(to)) reasons.push(`"${email.to || ''}" is not a valid email address`);
  if (email.prospectEmail !== undefined && email.prospectEmail.trim().toLowerCase() !== to) {
    reasons.push('recipient does not match the prospect record');
  }
  if ((email.optedOut || []).some((e) => e.trim().toLowerCase() === to)) {
    reasons.push('this address opted out; never email it again');
  }
  if (!['A', 'B'].includes(email.track)) reasons.push('track must be A (agents) or B (websites)');

  if (!subject) reasons.push('subject is empty');
  if (subject.length > MAX_SUBJECT) reasons.push(`subject is ${subject.length} characters (max ${MAX_SUBJECT})`);
  if (step !== 'reply' && /^\s*(re|fwd?)\s*:/i.test(subject)) {
    reasons.push('subject fakes a reply or forward ("Re:"/"Fwd:") on a cold email');
  }

  if (!body) reasons.push('body is empty');
  const limit = WORD_LIMITS[step];
  if (!limit) reasons.push(`unknown step "${step}"`);
  else if (words > limit) reasons.push(`body is ${words} words (step ${step} max is ${limit})`);

  const all = `${subject}\n${body}`;
  const tag = all.match(MERGE_TAG_RE);
  if (tag) reasons.push(`unfilled placeholder: ${tag[0]}`);

  const lowered = all.toLowerCase();
  const hits = BANNED_PHRASES.filter((p) => lowered.includes(p));
  if (hits.length) reasons.push(`banned phrases: ${hits.slice(0, 3).join(', ')}`);

  if (all.includes('—')) reasons.push('uses an em dash (reads as AI-written)');
  const bangs = (all.match(/!/g) || []).length;
  if (bangs > 1) reasons.push(`${bangs} exclamation marks (max 1)`);

  const links = body.match(URL_RE) || [];
  if (step === 1 && links.length) reasons.push('first email must not contain links');
  if (links.length > 1) reasons.push(`${links.length} links (max 1)`);
  if (HTML_RE.test(body)) reasons.push('contains HTML; plain text only');
  if (MARKDOWN_RE.test(body)) reasons.push('contains bullets, headers or bold; write plain sentences');

  const prices = [...all.matchAll(DOLLAR_RE)].map((m) => Number(m[1].replace(/,/g, '')));
  if (email.track === 'A' && prices.length) {
    reasons.push('agent emails must not quote prices (Butler jobs are priced per job)');
  }
  if (email.track === 'B') {
    const bad = prices.filter((p) => p < WEBSITE_PRICE.min || p > WEBSITE_PRICE.max);
    if (bad.length) reasons.push(`price $${bad[0]} is outside the $700 to $1,250 website range`);
  }

  return { ok: reasons.length === 0, reasons, words };
}

// Command-line use. Skipped when the Desk imports this file in a browser.
const isCli = typeof process !== 'undefined' && process.argv?.[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isCli) {
  const read = async () => {
    if (process.argv[2]) return process.argv[2];
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    return input;
  };
  const input = JSON.parse(await read());
  const list = Array.isArray(input) ? input : [input];
  const results = list.map((e) => ({ to: e.to, ...checkEmail(e) }));
  console.log(JSON.stringify(Array.isArray(input) ? results : results[0], null, 2));
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
