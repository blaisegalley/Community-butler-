/*
 * The deterministic checks. Everything here runs before, and regardless
 * of, any model call — so the safety floor and the service-area answer do
 * not depend on an API being up or a model behaving.
 */
import type { AgentConfig, ServiceArea } from './config.ts';
import { SERVICES } from './config.ts';
import type { AgentJob, Channel, SafetyResult, Tier } from './types.ts';

// ------------------------------------------------------------- text helpers

export function words(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function firstName(name: string): string {
  return (name || '').trim().split(/\s+/)[0] || '';
}

/** Digits only, last 10 — so "(847) 555-0101" and "847.555.0101" match. */
export function normPhone(phone: string): string {
  return (phone || '').replace(/\D/g, '').slice(-10);
}

export function normEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

// ------------------------------------------------------------- service area

function townPattern(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${escaped}\\b`, 'i');
}

/**
 * Finds the town in an address or a post. Longest names first, so
 * "South Barrington" is not read as "Barrington".
 */
export function detectTown(text: string, config: AgentConfig): ServiceArea | null {
  const candidates = config.serviceAreas
    .flatMap((area) => [area.town, ...area.aliases].map((name) => ({ area, name })))
    .sort((a, b) => b.name.length - a.name.length);
  for (const { area, name } of candidates) {
    if (townPattern(name).test(text)) return area;
  }
  return null;
}

/** "12 Maple St, Arlington Heights" -> "Arlington Heights". The part of an address safe to put in a group message. */
export function coarseArea(address: string, config: AgentConfig): string {
  const town = detectTown(address, config);
  if (town) return town.town;
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1].replace(/\b(IL|Illinois)\b.*$/i, '').trim() : '';
}

export function isAdjacent(a: string, b: string, config: AgentConfig): boolean {
  const area = config.serviceAreas.find((s) => s.town === a);
  return Boolean(area?.adjacent.includes(b));
}

// ------------------------------------------------------------- services and prices

const SERVICE_KEYWORDS: [string, RegExp][] = [
  ['Snow shoveling', /\b(snow|shovel|plow|driveway clear|ice)\b/i],
  ['Dog walking', /\b(dog|walk(ing)? (my|our) (dog|pup)|puppy|pet sit)\b/i],
  ['Junk hauling', /\b(junk|haul|dump run|get rid of|remove (an? )?old)\b/i],
  ['Cleanout', /\b(clean ?out|declutter|clear out)\b/i],
  ['Moving help', /\b(mov(e|ing)|carry|load(ing)? (a |the )?(truck|van)|furniture|couch|sofa)\b/i],
  ['Yard work', /\b(yard|lawn|mow|weed|rake|raking|leaves|mulch|garden|hedge|power ?wash|pressure ?wash)\b/i],
];

/** Maps whatever the form or a post says to one of the catalog services. */
export function normalizeService(service: string, details = ''): string {
  const exact = SERVICES.find((s) => s.toLowerCase() === service.trim().toLowerCase());
  if (exact) return exact;
  const text = `${service} ${details}`;
  for (const [name, pattern] of SERVICE_KEYWORDS) if (pattern.test(text)) return name;
  return 'Odd job';
}

export function parseBudget(budget: string): number | null {
  const match = (budget || '').replace(/,/g, '').match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function priceGuidance(service: string, budget: string, config: AgentConfig) {
  const range = config.priceBook[service] ?? config.priceBook['Odd job'];
  const stated = parseBudget(budget);
  return {
    low: range.low,
    high: range.high,
    stated,
    belowFloor: stated !== null && stated < range.floor,
  };
}

// ------------------------------------------------------------- duplicates

/** A same-contact, same-service request in the last 7 days that is still open. */
export function findDuplicate(job: AgentJob, others: AgentJob[]): AgentJob | null {
  const phone = normPhone(job.phone);
  const email = normEmail(job.email);
  const service = normalizeService(job.service, job.details);
  const since = +new Date(job.submittedAt) - 7 * 24 * 3600 * 1000;
  return (
    others.find(
      (other) =>
        other.id !== job.id &&
        other.status !== 'Rejected' &&
        +new Date(other.submittedAt) >= since &&
        +new Date(other.submittedAt) <= +new Date(job.submittedAt) &&
        normalizeService(other.service, other.details) === service &&
        ((phone.length === 10 && normPhone(other.phone) === phone) || (email && normEmail(other.email) === email)),
    ) ?? null
  );
}

// ------------------------------------------------------------- safety

const RED_RULES: [RegExp, string][] = [
  [/\broof(top)?\b/i, 'Roof work'],
  [/\b(extension ladder|tall ladder|second[- ]stor(y|ey)|2nd[- ]stor(y|ey)|third floor window)\b/i, 'Ladder work above about 6 ft'],
  [/\b(chain ?saw|tree removal|cut down (a |the )?tree|fell(ing)? (a |the )?tree|stump grind)/i, 'Chainsaw or tree felling'],
  [/\b(electrical|wiring|rewire|breaker|outlet install|gas line|furnace|water heater)\b/i, 'Electrical or gas work'],
  [/\b(pool chemicals?|chlorine|pesticide|herbicide spray)\b/i, 'Hazardous chemicals'],
  [/\b(drive me|give me a ride|pick me up|ride to|drive (my|our) car)\b/i, 'Driving the customer'],
  [/\b(gun|firearm|rifle|ammo|alcohol|beer|liquor|party)\b/i, 'Alcohol, firearms or a party'],
  [/\b(after dark|overnight|midnight|(9|10|11) ?pm)\b/i, 'Work after dark'],
  [/\b(babysit|childcare|watch (my|our) kids)\b/i, 'Childcare (not a service we offer)'],
  [/\b(cute|pretty|hot|handsome|good[- ]looking)\b.*\b(girl|boy|student|teen|kid)\b|\bsend (a )?(pic|photo)s? of (yourself|them)\b/i, 'Request about a student\'s appearance'],
];

const YELLOW_RULES: [RegExp, string, Partial<SafetyResult['conditions']>][] = [
  [/\b(inside|indoors|basement|attic|upstairs|in the house|bedroom|closet)\b/i, 'Work inside the home', { pairRequired: true }],
  [/\b(heavy|piano|couch|sofa|fridge|refrigerator|freezer|washer|dryer|dresser|appliance|hot tub)\b/i, 'Heavy lifting', { pairRequired: true }],
  [/\b(power ?wash|pressure ?wash)/i, 'Power tools (pressure washer)', { minGrade: 'Sophomore' }],
  [/\b(ladder)\b/i, 'Ladder use (must stay under about 6 ft)', {}],
  [/\b(elderly|senior|my (mom|dad|mother|father) is \d{2}|wheelchair|walker|dementia|disabled)\b/i, 'Vulnerable customer', { pairRequired: true }],
  [/\b(tech help|computer|laptop|wi-?fi|iphone|ipad|printer|password|bank(ing)?|email account)\b/i, 'Tech help (no passwords or money matters)', {}],
  [/\b(all day|full day|([5-9]|1\d) hours)\b/i, 'Long job (over 4 hours)', {}],
];

/**
 * Tiers a job by rule. The model can raise this, never lower it — the
 * caller enforces that by taking the max.
 */
export function ruleSafety(job: AgentJob, service: string, config: AgentConfig): SafetyResult {
  const text = `${job.service} ${job.details}`;
  const reasons: string[] = [];
  const conditions = { pairRequired: false, minGrade: '', daylightOnly: true };
  let tier: Tier = 'Green';

  for (const [pattern, reason] of RED_RULES) {
    if (pattern.test(text)) {
      tier = 'Red';
      reasons.push(reason);
    }
  }
  if (config.pairServices.includes(service)) {
    if (tier === 'Green') tier = 'Yellow';
    reasons.push(`${service} means going inside a home or heavy lifting`);
    conditions.pairRequired = true;
  }
  for (const [pattern, reason, extra] of YELLOW_RULES) {
    if (pattern.test(text)) {
      if (tier === 'Green') tier = 'Yellow';
      reasons.push(reason);
      if (extra.pairRequired) conditions.pairRequired = true;
      if (extra.minGrade) conditions.minGrade = extra.minGrade;
    }
  }
  return { tier, reasons: [...new Set(reasons)], conditions, messageProblems: [] };
}

const TIER_RANK: Record<Tier, number> = { Green: 0, Yellow: 1, Red: 2 };

export function maxTier(a: Tier, b: Tier): Tier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

const PUBLIC_OR_GROUP: Channel[] = ['groupme', 'nextdoor', 'instagram'];

const STREET =
  /\b\d{1,5}\s+(?:[NSEW]\.?\s+)?[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+(?:St|Street|Ave|Avenue|Rd|Road|Ln|Lane|Dr|Drive|Ct|Court|Blvd|Boulevard|Way|Pl|Place|Cir|Circle|Ter|Terrace|Trl|Trail|Pkwy|Parkway)\b\.?/;
const PHONE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
// "Licensed" is only a problem when it describes us; pointing a neighbor to
// "a licensed pro" for a job we turned down is exactly what we want to say.
const PROMISES =
  /\b(insured|insurance|guarantee(d)?|background[- ]check(ed|s)?|bonded|certified)\b|\blicensed\b(?!\s+(pro|professional|contractor|electrician|plumber|arborist|roofer|tree))/i;
const INJECTION = /\b(ignore (all |any )?(previous|prior|above) instructions|system prompt|you are now|disregard (the|your) (rules|instructions))\b/i;

/**
 * Screens an outbound message. Any problem returned blocks one-tap
 * approval; the admin has to edit the text first.
 */
export function screenMessage(text: string, channel: Channel, config: AgentConfig): string[] {
  const problems: string[] = [];
  const isGroup = PUBLIC_OR_GROUP.includes(channel);
  if (isGroup && STREET.test(text)) problems.push('Contains a street address in a group or public post');
  const phones = text.match(new RegExp(PHONE.source, 'g')) ?? [];
  const businessPhone = normPhone(config.businessPhone);
  if (isGroup && phones.some((p) => normPhone(p) !== businessPhone)) problems.push('Contains a phone number in a group or public post');
  if (isGroup && EMAIL.test(text)) problems.push('Contains an email address in a group or public post');
  if (PROMISES.test(text)) problems.push('Promises something we cannot back up (insurance, guarantees, background checks, licensing)');
  if (INJECTION.test(text)) problems.push('Looks like it repeats instructions copied from a stranger\'s message');
  return problems;
}

export function looksLikeInjection(text: string): boolean {
  return INJECTION.test(text);
}

// ------------------------------------------------------------- grades

const GRADES = ['Freshman', 'Sophomore', 'Junior', 'Senior'];

/** True when `grade` meets `min`. Unknown grade fails a real minimum — fail closed. */
export function meetsGrade(grade: string, min: string): boolean {
  if (!min) return true;
  const have = GRADES.indexOf(grade);
  return have >= 0 && have >= GRADES.indexOf(min);
}

// ------------------------------------------------------------- similarity

function shingles(text: string): Set<string> {
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i++) out.add(`${tokens[i]} ${tokens[i + 1]}`);
  return out;
}

/** Jaccard similarity of word pairs, 0..1. Used to keep Nextdoor replies from looking copy-pasted. */
export function similarity(a: string, b: string): number {
  const x = shingles(a);
  const y = shingles(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const item of x) if (y.has(item)) shared++;
  return shared / (x.size + y.size - shared);
}
