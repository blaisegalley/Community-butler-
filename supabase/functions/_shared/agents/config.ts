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

export interface AgentConfig {
  businessName: string;
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
  deadlinesHours: { lead: number; default: number };
  followupWindowDays: number;
  voice: { blocklist: string[]; maxWords: Record<string, number> };
  killSwitches: Partial<Record<string, boolean>>;
}

export const SERVICES = ['Yard work', 'Snow shoveling', 'Moving help', 'Junk hauling', 'Cleanout', 'Dog walking', 'Odd job'];

export const DEFAULT_CONFIG: AgentConfig = {
  businessName: 'Community Butler',
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
  deadlinesHours: { lead: 24, default: 72 },
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
