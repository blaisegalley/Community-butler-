/*
 * Every number and word list the agents decide with.
 *
 * These are config, not code, on purpose: the co-admins own policy (which
 * towns, what a job costs, what is unsafe for a teenager), and changing a
 * policy should never need a programmer. On the hosted backend the active
 * row in `agent_config` is merged over these defaults, so any key here can
 * be overridden without a deploy.
 *
 * Values marked PLACEHOLDER are starting guesses for the co-admins to
 * confirm (see "Decisions the co-admins need to make" in
 * docs/multi-agent-system.md).
 */

export interface ServiceArea {
  town: string;
  active: boolean;
  /** Other spellings people type: "Arlington Hts", "Elk Grove". */
  aliases: string[];
  adjacent: string[];
}

export interface PriceRange {
  floor: number;
  low: number;
  high: number;
}

export interface Season {
  service: string;
  label: string;
  /** 1-12 */
  startMonth: number;
  startDay: number;
  leadWeeks: number;
}

export interface WebTier {
  name: string;
  price: number;
  maxPages: number;
  includes: string[];
}

export interface AgentConfig {
  businessName: string;
  /** Linked from recruiting posts ("sign up at …/auth/"). */
  siteUrl: string;
  businessPhone: string;
  schoolShortName: string;
  model: string;
  /** USD per million tokens, for the cost ledger. */
  pricing: { input: number; output: number };
  monthlyBudgetUsd: number;
  maxRevisions: number;
  lowConfidence: number;
  serviceAreas: ServiceArea[];
  /** Keyed by the service names the /request form offers. PLACEHOLDER prices. */
  priceBook: Record<string, PriceRange>;
  /** Services that put a student inside someone's home or lifting heavy things. */
  pairServices: string[];
  matching: {
    weights: { service: number; proximity: number; reliability: number; fairness: number; affinity: number };
    assignThreshold: number;
    assignMargin: number;
    pairThreshold: number;
    overloadOpenJobs: number;
  };
  escalation: { firstHours: number; secondHours: number; snowFirstHours: number; snowSecondHours: number };
  deadlinesHours: { lead: number; default: number; review: number };
  followupWindowDays: number;
  voice: { blocklist: string[]; maxWords: Record<string, number> };
  killSwitches: Partial<Record<string, boolean>>;
  recruiting: {
    /** Butlers available per open-or-expected job below which we recruit. */
    gapRatio: number;
    urgentRatio: number;
    /** Above this, there are more Butlers than work: push demand instead. */
    surplusRatio: number;
    nudgeAfterDays: number;
    pendingReviewHours: number;
    inactiveDays: number;
    seasons: Season[];
  };
  b2b: {
    /** Days after the first email to send follow-ups 2 and 3. */
    followupDays: number[];
    maxTouches: number;
    /** What we offer each kind of business. Used as facts in the outreach email. */
    playbook: Record<string, string>;
  };
  webStudio: { minBudget: number; revisionRounds: number; tiers: WebTier[]; qaChecklist: string[] };
  analyst: {
    /** Waitlisted requests from one town in 30 days before proposing we serve it. */
    expansionThreshold: number;
    /** Approved-as-is rate below which an agent's drafts get flagged for a prompt review. */
    lowApprovalRate: number;
    minSample: number;
    /** Unclaimed-job escalations in 14 days before proposing an easier assignment threshold. */
    escalationsBeforeTuning: number;
    /** The weekly review is planned on the first run after this UTC hour on Monday (12 = 7am Chicago). */
    reviewHourUtc: number;
  };
}

export const SERVICES = ['Yard work', 'Snow shoveling', 'Moving help', 'Junk hauling', 'Cleanout', 'Dog walking', 'Odd job'];

export const DEFAULT_CONFIG: AgentConfig = {
  businessName: 'Community Butler',
  siteUrl: 'https://thecommunitybutler.com',
  businessPhone: '(224) 633-9328',
  schoolShortName: 'BHS',
  model: 'claude-opus-5-5',
  pricing: { input: 4, output: 20 },
  monthlyBudgetUsd: 20,
  maxRevisions: 2,
  lowConfidence: 0.7,
  serviceAreas: [
    { town: 'Barrington', active: true, aliases: [], adjacent: ['Barrington Hills', 'Lake Barrington', 'North Barrington', 'South Barrington', 'Inverness', 'Deer Park'] },
    { town: 'Barrington Hills', active: true, aliases: [], adjacent: ['Barrington', 'South Barrington'] },
    { town: 'Lake Barrington', active: true, aliases: [], adjacent: ['Barrington', 'North Barrington'] },
    { town: 'North Barrington', active: true, aliases: [], adjacent: ['Barrington', 'Lake Barrington'] },
    { town: 'South Barrington', active: true, aliases: [], adjacent: ['Barrington', 'Inverness', 'Schaumburg'] },
    { town: 'Inverness', active: true, aliases: [], adjacent: ['Barrington', 'Palatine', 'South Barrington'] },
    { town: 'Deer Park', active: true, aliases: [], adjacent: ['Barrington', 'Lake Zurich'] },
    { town: 'Arlington Heights', active: true, aliases: ['Arlington Hts', 'Arl Heights'], adjacent: ['Palatine', 'Mount Prospect', 'Rolling Meadows'] },
    { town: 'Elk Grove Village', active: true, aliases: ['Elk Grove'], adjacent: ['Schaumburg', 'Mount Prospect', 'Arlington Heights'] },
    { town: 'Schaumburg', active: true, aliases: [], adjacent: ['Hoffman Estates', 'Elk Grove Village', 'Rolling Meadows'] },
    { town: 'Palatine', active: false, aliases: [], adjacent: ['Inverness', 'Arlington Heights'] },
    { town: 'Rolling Meadows', active: false, aliases: [], adjacent: ['Arlington Heights', 'Schaumburg'] },
    { town: 'Hoffman Estates', active: false, aliases: [], adjacent: ['Schaumburg', 'South Barrington'] },
    { town: 'Mount Prospect', active: false, aliases: ['Mt Prospect', 'Mt. Prospect'], adjacent: ['Arlington Heights', 'Elk Grove Village'] },
    { town: 'Lake Zurich', active: false, aliases: [], adjacent: ['Deer Park'] },
    { town: 'Des Plaines', active: false, aliases: [], adjacent: ['Mount Prospect'] },
  ],
  priceBook: {
    'Yard work': { floor: 20, low: 30, high: 80 },
    'Snow shoveling': { floor: 15, low: 25, high: 60 },
    'Moving help': { floor: 30, low: 40, high: 120 },
    'Junk hauling': { floor: 30, low: 40, high: 120 },
    Cleanout: { floor: 40, low: 60, high: 200 },
    'Dog walking': { floor: 10, low: 15, high: 25 },
    'Odd job': { floor: 20, low: 25, high: 80 },
  },
  pairServices: ['Moving help', 'Junk hauling', 'Cleanout'],
  matching: {
    weights: { service: 0.3, proximity: 0.25, reliability: 0.2, fairness: 0.15, affinity: 0.1 },
    assignThreshold: 0.75,
    assignMargin: 0.1,
    pairThreshold: 0.6,
    overloadOpenJobs: 3,
  },
  escalation: { firstHours: 12, secondHours: 24, snowFirstHours: 2, snowSecondHours: 4 },
  deadlinesHours: { lead: 24, default: 72, review: 168 },
  followupWindowDays: 7,
  voice: {
    blocklist: [
      'leverage', 'solutions', 'synergy', 'we are pleased', 'valued customer', 'premier', 'dear customer',
      'best-in-class', 'world-class', 'cutting-edge', 'seamless', 'utilize', 'team of professionals',
      'professional services', 'hassle-free', "don't hesitate to", 'per our', 'kindly', 'our company',
    ],
    maxWords: { nextdoor: 90, instagram: 90, groupme: 60, email: 160, butler_app: 60 },
  },
  killSwitches: {},
  recruiting: {
    gapRatio: 1.5,
    urgentRatio: 1,
    surplusRatio: 4,
    nudgeAfterDays: 2,
    pendingReviewHours: 48,
    inactiveDays: 30,
    seasons: [
      { service: 'Yard work', label: 'leaf season', startMonth: 10, startDay: 1, leadWeeks: 6 },
      { service: 'Snow shoveling', label: 'snow season', startMonth: 12, startDay: 1, leadWeeks: 6 },
    ],
  },
  b2b: {
    followupDays: [5, 12],
    maxTouches: 3,
    playbook: {
      realtor: 'Pre-listing yard cleanups, junk hauling before photos or a move-out, and snow shoveling before showings and open houses.',
      property_manager: 'Turnover cleanouts and junk hauling between tenants, plus seasonal leaf and snow work for small buildings.',
      hoa: 'Leaf raking and snow on common walkways, and extra hands for community cleanup days.',
      small_business: 'Storefront snow and sidewalk cleanup, help moving inventory, and an affordable website built by students ($700-$1,250).',
    },
  },
  // PLACEHOLDER inclusions; prices are the ones the business has set.
  webStudio: {
    minBudget: 700,
    revisionRounds: 2,
    tiers: [
      { name: 'Starter', price: 700, maxPages: 3, includes: ['Up to 3 pages (home, services, contact)', 'Mobile-friendly design', 'Contact form', 'Basic search setup (title, description, Google Business link)'] },
      { name: 'Standard', price: 950, maxPages: 6, includes: ['Up to 6 pages', 'Everything in Starter', 'Photo gallery or portfolio', 'Booking or menu link', 'Reviews section'] },
      { name: 'Plus', price: 1250, maxPages: 10, includes: ['Up to 10 pages', 'Everything in Standard', 'Blog or news page you can update', 'Online booking or a simple store'] },
    ],
    qaChecklist: [
      'Every page works on a phone (check on a real phone, not just a narrow window)',
      'Contact form sends to the client and they confirmed receiving a test',
      'All text is the client\'s approved copy; no placeholder text left',
      'Images have alt text; color contrast passes a checker',
      'Page titles and descriptions are set; Google Business link added',
      'Pages load in under 3 seconds on a phone connection',
      'Client owns the domain and hosting account, and has the logins',
    ],
  },
  analyst: { expansionThreshold: 5, lowApprovalRate: 0.6, minSample: 5, escalationsBeforeTuning: 3, reviewHourUtc: 12 },
};

/** The brand voice, as the drafting and voice-scoring prompts see it. Stable text: it is part of the cached prompt prefix. */
export function voiceGuide(config: AgentConfig): string {
  return `Brand voice for ${config.businessName}, a student-run neighborhood help service from ${config.schoolShortName} (Barrington High School, Illinois):
- Friendly and warm, like a text from a neighbor's kid. Not a company.
- Casual: contractions, short sentences, plain words.
- Local: mention the town or the school naturally, at most once.
- Student-peer: "a few of us at ${config.schoolShortName}", "we're high schoolers", never "our team of professionals".
- Truthful: only facts given in the task. Never promise insurance, guarantees, background checks, licensing, or exact prices.
- No hashtags, no all-caps words, at most one exclamation mark.
- Never include a street address, a student's last name, a phone number of a student, or a student's schedule.`;
}

/** Merges a partial override (from the agent_config table) over the defaults, one level deep. */
export function mergeConfig(override: Partial<AgentConfig> | null | undefined): AgentConfig {
  if (!override) return DEFAULT_CONFIG;
  const merged: AgentConfig = { ...DEFAULT_CONFIG };
  for (const key of Object.keys(override) as (keyof AgentConfig)[]) {
    const value = override[key];
    if (value === undefined || value === null) continue;
    const base = DEFAULT_CONFIG[key];
    (merged as unknown as Record<string, unknown>)[key] =
      base && typeof base === 'object' && !Array.isArray(base) && typeof value === 'object' && !Array.isArray(value)
        ? { ...(base as object), ...(value as object) }
        : value;
  }
  return merged;
}
