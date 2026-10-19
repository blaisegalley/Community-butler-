/*
 * Unit tests for the agent core. Run with:  npm test
 * (Node >= 22.18 runs the .ts files directly; no build step.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDecision,
  classifyLead,
  DEFAULT_CONFIG,
  DecisionError,
  detectTown,
  newTaskRow,
  planTasks,
  rankButlers,
  refine,
  ruleSafety,
  runCare,
  runDispatcher,
  runIntake,
  runLeadScout,
  runMatch,
  screenMessage,
  supplyTable,
  planRecruiting,
  runRecruiter,
  planOutreach,
  runOutreach,
  runWebLead,
  runWebBrief,
  pickTier,
  findProposals,
  planAnalyst,
  runWeeklyReview,
  runProposal,
  leadStatusAdvances,
} from './index.ts';
import type { AgentButler, AgentContext, AgentJob, AgentRun, AgentTask, DispatcherIO, Lead, Llm, NewTask, SafetyResult } from './index.ts';

const config = DEFAULT_CONFIG;
const NOW = new Date('2026-10-16T15:00:00Z');

function job(overrides: Partial<AgentJob> = {}): AgentJob {
  return {
    id: 'job-1', service: 'Yard work', name: 'Pat Neighbor', phone: '847-555-0101', email: 'pat@example.com',
    address: '12 Maple St, Barrington, IL', date: '2026-10-20', budget: '50',
    details: 'Rake the front and back yard leaves into bags please', submittedAt: '2026-10-16T14:00:00Z',
    status: 'New', assignedButlerId: null, assignedAt: null, completedAt: null, ...overrides,
  };
}

function butler(overrides: Partial<AgentButler> & { id: string }): AgentButler {
  return {
    name: 'Sam Student', serviceArea: 'Barrington', jobTypePrefs: ['Yard work'], grade: 'Junior', approved: true,
    profileStatus: 'Approved', signedUpAt: '2026-09-01T00:00:00Z',
    stats: { assigned: 4, completed: 4, ratings: [5, 5, 4], jobsLast14Days: 0, openJobs: 0, happyCustomers: [] },
    ...overrides,
  };
}

function ctx(llm: Llm | null = null, runs: unknown[] = []): AgentContext {
  return { llm, log: (r) => runs.push(r), examples: [], costPerMillion: config.pricing };
}

const GREEN: SafetyResult = { tier: 'Green', reasons: [], conditions: { pairRequired: false, minGrade: '', daylightOnly: true }, messageProblems: [] };

// ---------------------------------------------------------------- rules

test('detects the longest matching town first', () => {
  assert.equal(detectTown('5 Oak Ln, South Barrington IL', config)?.town, 'South Barrington');
  assert.equal(detectTown('near Arlington Hts', config)?.town, 'Arlington Heights');
  assert.equal(detectTown('somewhere in Chicago', config), null);
});

test('safety rules: roof is Red, moving is Yellow with a pair, raking is Green', () => {
  assert.equal(ruleSafety(job({ details: 'Clean the gutters on the roof' }), 'Odd job', config).tier, 'Red');
  const moving = ruleSafety(job({ service: 'Moving help', details: 'Carry a couch upstairs' }), 'Moving help', config);
  assert.equal(moving.tier, 'Yellow');
  assert.equal(moving.conditions.pairRequired, true);
  assert.equal(ruleSafety(job(), 'Yard work', config).tier, 'Green');
  assert.equal(ruleSafety(job({ details: 'Shovel the driveway at 12pm' }), 'Snow shoveling', config).tier, 'Green');
});

test('outbound screening blocks addresses in group posts but allows the business phone', () => {
  assert.ok(screenMessage('Job at 12 Maple St tomorrow', 'groupme', config).length > 0);
  assert.deepEqual(screenMessage('Call us at (224) 633-9328', 'groupme', config), []);
  assert.ok(screenMessage("We're fully insured!", 'email', config).length > 0);
  assert.ok(screenMessage("We're licensed and bonded.", 'email', config).length > 0);
  assert.deepEqual(screenMessage("This one is best handled by a licensed pro.", 'email', config), []);
});

// ---------------------------------------------------------------- intake

test('intake: a clean Barrington request becomes an approve card', async () => {
  const { draft } = await runIntake(job(), [], ctx(), config, NOW);
  assert.equal(draft.action.kind, 'approve_job');
  assert.equal(draft.safety.tier, 'Green');
  assert.ok(draft.flags.includes('template'));
});

test('intake: out-of-area request is waitlisted with an email', async () => {
  const { draft } = await runIntake(job({ address: '9 Elm Ave, Palatine, IL' }), [], ctx(), config, NOW);
  assert.equal(draft.action.kind, 'decline_job');
  assert.equal(draft.channel, 'email');
  assert.match(draft.text, /Palatine/);
});

test('intake: Red request drafts a decline that needs two admins to override', async () => {
  const { draft, priority } = await runIntake(job({ details: 'Cut down a dead tree with a chainsaw' }), [], ctx(), config, NOW);
  assert.equal(draft.safety.tier, 'Red');
  assert.ok(draft.flags.includes('two_admins_to_override'));
  assert.equal(priority, 2);
  assert.deepEqual(draft.safety.messageProblems, [], 'the decline template itself passes screening');
});

test('intake: a vague request asks one clarifying question', async () => {
  const { draft } = await runIntake(job({ service: 'Odd job', details: 'help' }), [], ctx(), config, NOW);
  assert.equal(draft.action.kind, 'message_neighbor');
});

test('intake: duplicates are caught', async () => {
  const earlier = job({ id: 'job-0', submittedAt: '2026-10-15T10:00:00Z' });
  const { draft } = await runIntake(job(), [earlier], ctx(), config, NOW);
  assert.equal(draft.action.kind, 'decline_job');
  assert.match(draft.title, /duplicate/i);
});

test('intake: the model can raise the tier but never lower it', async () => {
  const lowering: Llm = async () => ({ data: { summary: 'Fine', critical_missing: [], tier: 'Green', risk_notes: [], confidence: 0.9 }, inputTokens: 10, outputTokens: 5 });
  const red = await runIntake(job({ details: 'Fix the roof shingles' }), [], ctx(lowering), config, NOW);
  assert.equal(red.draft.safety.tier, 'Red');

  const raising: Llm = async (req) =>
    req.purpose === 'assess job request'
      ? { data: { summary: 'Odd', critical_missing: [], tier: 'Red', risk_notes: ['Customer asked for a ride'], confidence: 0.8 }, inputTokens: 10, outputTokens: 5 }
      : { data: { message: 'Hi Pat, this one is better for a licensed pro. Thanks for thinking of us.' }, inputTokens: 10, outputTokens: 5 };
  const raised = await runIntake(job(), [], ctx(raising), config, NOW);
  assert.equal(raised.draft.safety.tier, 'Red');
});

// ---------------------------------------------------------------- refine loop

test('refine: sends a bad draft back with notes, then accepts the fix', async () => {
  let calls = 0;
  const llm: Llm = async (req) => {
    if (req.agent === 'voice') return { data: { scores: { friendly: 5, casual: 5, local: 5, student_peer: 5, channel_fit: 5, truthful: 5 }, fix_notes: [] }, inputTokens: 1, outputTokens: 1 };
    calls++;
    return { data: { message: calls === 1 ? 'We leverage synergy for valued customer solutions.' : 'Hi! A few of us at BHS can help with that.' }, inputTokens: 1, outputTokens: 1 };
  };
  const c = ctx(llm);
  const { draftRequest } = await import('./voice.ts');
  const result = await refine({ ctx: c, config, agent: 'lead_scout', channel: 'nextdoor', facts: '', draftWithModel: draftRequest(c, config, 'lead_scout', 'x', 'x', 'x'), template: () => 'template' });
  assert.equal(result.source, 'model');
  assert.equal(result.revisions, 1);
  assert.equal(result.text, 'Hi! A few of us at BHS can help with that.');
});

test('refine: gives up after two revisions and flags it for a human', async () => {
  const llm: Llm = async (req) =>
    req.agent === 'voice'
      ? { data: { scores: { friendly: 2, casual: 5, local: 5, student_peer: 5, channel_fit: 5, truthful: 5 }, fix_notes: ['Warmer'] }, inputTokens: 1, outputTokens: 1 }
      : { data: { message: 'Hello.' }, inputTokens: 1, outputTokens: 1 };
  const c = ctx(llm);
  const { draftRequest } = await import('./voice.ts');
  const result = await refine({ ctx: c, config, agent: 'care', channel: 'email', facts: '', draftWithModel: draftRequest(c, config, 'care', 'x', 'x', 'x'), template: () => 'template' });
  assert.equal(result.revisions, 2);
  assert.ok(result.flags.includes('needs_polish'));
});

test('refine: a model outage falls back to the template', async () => {
  const runs: AgentRun[] = [];
  const c = ctx(async () => { throw new Error('529 overloaded'); }, runs);
  const { draftRequest } = await import('./voice.ts');
  const result = await refine({ ctx: c, config, agent: 'care', channel: 'email', facts: '', draftWithModel: draftRequest(c, config, 'care', 'x', 'x', 'x'), template: () => 'Thanks so much!' });
  assert.equal(result.source, 'template');
  assert.equal(result.text, 'Thanks so much!');
  assert.ok(runs.some((r) => r.error.includes('529')));
});

// ---------------------------------------------------------------- matchmaker

test('matchmaker: strong same-town fit is assigned directly', async () => {
  const { draft } = await runMatch(job({ status: 'Approved' }), [butler({ id: 'b1' }), butler({ id: 'b2', name: 'Alex', serviceArea: 'Schaumburg', stats: { assigned: 0, completed: 0, ratings: [], jobsLast14Days: 4, openJobs: 0, happyCustomers: [] } })], GREEN, ctx(), config);
  assert.equal(draft.action.kind, 'assign_butler');
  assert.deepEqual(draft.action.kind === 'assign_butler' && draft.action.butlerIds, ['b1']);
});

test('matchmaker: GroupMe post never contains the address', async () => {
  const { draft } = await runMatch(job({ status: 'Approved' }), [], GREEN, ctx(), config);
  assert.equal(draft.action.kind, 'post_groupme');
  assert.doesNotMatch(draft.text, /Maple/);
  assert.match(draft.text, /Barrington/);
});

test('matchmaker: grade minimum excludes unknown grades (fail closed)', () => {
  const safety = { ...GREEN, conditions: { ...GREEN.conditions, minGrade: 'Sophomore' } };
  const { ranked, excluded } = rankButlers(job(), [butler({ id: 'b1', grade: '' }), butler({ id: 'b2', grade: 'Senior' })], safety, config);
  assert.deepEqual(ranked.map((r) => r.butler.id), ['b2']);
  assert.equal(excluded[0].butler.id, 'b1');
});

// ---------------------------------------------------------------- lead scout + care

test('lead scout: drops ads, drafts two variants for a real ask', async () => {
  assert.equal(classifyLead('I offer lawn mowing, DM me for rates').intent, 'OFF_TOPIC');
  const lead: Lead = { id: 'l1', channel: 'nextdoor', text: 'Does anyone know a teen who can shovel snow in Barrington tomorrow?', town: '', author: 'Blaise', status: 'new', details: {}, createdAt: NOW.toISOString() };
  const result = await runLeadScout(lead, [], ctx(), config, NOW, 'Blaise');
  assert.ok(result.draft);
  assert.equal(result.draft?.variants.length, 2);
  assert.notEqual(result.draft?.variants[0], result.draft?.variants[1]);
  assert.match(result.draft!.text, /Blaise/);
});

test('care: a low rating becomes an internal incident, not an email', async () => {
  const { draft, priority } = await runCare(job({ status: 'Completed', rating: 2, completedAt: NOW.toISOString() }), butler({ id: 'b1' }), ctx(), config);
  assert.equal(draft.channel, 'internal');
  assert.equal(priority, 3);
});

// ---------------------------------------------------------------- dispatcher + decisions

test('planTasks is idempotent and escalates unclaimed jobs', () => {
  const jobs = [job(), job({ id: 'job-2', status: 'Approved' })];
  const first = planTasks(jobs, new Map(), config, NOW);
  assert.deepEqual(first.map((t) => t.idempotencyKey).sort(), ['job:job-1:intake', 'job:job-2:match']);
  const index = new Map(first.map((t) => [t.idempotencyKey, { createdAt: new Date(+NOW - 13 * 3600e3).toISOString(), state: 'done' }]));
  const second = planTasks(jobs, index, config, NOW);
  assert.deepEqual(second.map((t) => t.idempotencyKey), ['job:job-2:escalate:1']);
});

function memoryIO(jobs: AgentJob[], butlers: AgentButler[], llm: Llm | null = null): DispatcherIO & { tasks: AgentTask[] } {
  const tasks: AgentTask[] = [];
  let n = 0;
  return {
    tasks,
    now: () => NOW,
    llm,
    config,
    loadJobs: async () => jobs,
    loadButlers: async () => butlers,
    loadLead: async () => null,
    taskIndex: async () => new Map(tasks.map((t) => [t.idempotencyKey, { createdAt: t.createdAt, state: t.state }])),
    insertTasks: async (list: NewTask[]) => { for (const t of list) tasks.push(newTaskRow(t, `t${++n}`, NOW)); },
    claimTasks: async (limit) => {
      const due = tasks.filter((t) => (t.state === 'queued' || t.state === 'retry') && +new Date(t.runAfter) <= +NOW).slice(0, limit);
      for (const t of due) { t.state = 'running'; t.attempts++; }
      return due.map((t) => ({ ...t }));
    },
    saveTask: async (task) => { const i = tasks.findIndex((t) => t.id === task.id); tasks[i] = task; },
    awaitingTasks: async () => tasks.filter((t) => t.state === 'awaiting_approval'),
    intakeSafety: async () => null,
    examples: async () => [],
    postedReplies: async () => [],
    setLeadStatus: async () => {},
    logRuns: async () => {},
    monthSpendUsd: async () => 0,
    loadLeads: async () => [],
    recentTasks: async () => tasks,
    recentRuns: async () => [],
  };
}

test('dispatcher: new job ends up as a card awaiting approval', async () => {
  const io = memoryIO([job()], []);
  const summary = await runDispatcher(io);
  // The intake card, plus — with no Butlers at all — a recruiting card for
  // Barrington yard work, plus this week's review (NOW is a Friday).
  assert.deepEqual(io.tasks.map((t) => t.idempotencyKey).sort(), ['job:job-1:intake', 'recruit:gap:Barrington:Yard work:2026-W42', 'review:2026-W42']);
  assert.equal(summary.awaitingApproval, 3);
  assert.equal(io.tasks.find((t) => t.type === 'JOB_INTAKE')?.state, 'awaiting_approval');
  // A second run plans nothing new.
  assert.equal((await runDispatcher(io)).enqueued, 0);
});

test('dispatcher: a crashing task retries, then dead-letters', async () => {
  const io = memoryIO([job()], []);
  io.loadButlers = async () => { throw new Error('db down'); };
  await assert.rejects(runDispatcher(io));
  const io2 = memoryIO([job()], []);
  io2.intakeSafety = async () => { throw new Error('boom'); };
  io2.loadJobs = async () => [job({ status: 'Approved' })];
  for (let i = 0; i < 3; i++) {
    for (const t of io2.tasks) t.runAfter = NOW.toISOString();
    await runDispatcher(io2);
  }
  assert.equal(io2.tasks[0].state, 'dead_letter');
});

test('dispatcher: over budget means template mode, not silence', async () => {
  const io = memoryIO([job()], [], async () => { throw new Error('should not be called'); });
  io.monthSpendUsd = async () => 999;
  const summary = await runDispatcher(io);
  assert.equal(summary.templateMode, true);
  assert.equal(io.tasks[0].state, 'awaiting_approval');
});

test('dispatcher: unapproved drafts expire instead of going out late', async () => {
  const io = memoryIO([job()], []);
  await runDispatcher(io);
  io.tasks[0].deadline = new Date(+NOW - 1000).toISOString();
  const summary = await runDispatcher(io);
  assert.equal(summary.expired, 1);
  assert.equal(io.tasks[0].state, 'expired');
});

test('decisions: overriding a Red decline needs two different admins', async () => {
  const { draft } = await runIntake(job({ details: 'Help me rewire an outlet' }), [], ctx(), config, NOW);
  const task: AgentTask = { ...newTaskRow({ type: 'JOB_INTAKE', subjectType: 'job', subjectId: 'job-1', idempotencyKey: 'k', priority: 2 }, 't1', NOW), state: 'awaiting_approval', draft };
  const first = applyDecision(task, { admin: 'a@x.com', decision: 'override' }, config, NOW);
  assert.equal(first.execute, null);
  const again = applyDecision(first.task, { admin: 'A@x.com', decision: 'override' }, config, NOW);
  assert.equal(again.execute, null, 'same admin twice does not count');
  const second = applyDecision(again.task, { admin: 'b@x.com', decision: 'override' }, config, NOW);
  assert.equal(second.execute?.action.kind, 'approve_job');
});

test('decisions: a message with a street address cannot be approved into GroupMe', async () => {
  const { draft } = await runMatch(job({ status: 'Approved' }), [], GREEN, ctx(), config);
  const task: AgentTask = { ...newTaskRow({ type: 'JOB_MATCH', subjectType: 'job', subjectId: 'job-1', idempotencyKey: 'k', priority: 2 }, 't1', NOW), state: 'awaiting_approval', draft };
  assert.throws(() => applyDecision(task, { admin: 'a', decision: 'edit', text: 'Rake at 12 Maple St' }, config, NOW), DecisionError);
  assert.equal(applyDecision(task, { admin: 'a', decision: 'approve' }, config, NOW).execute?.action.kind, 'post_groupme');
});

test('decisions: "tone" sends a card back, twice at most', async () => {
  const { draft } = await runIntake(job({ address: '1 A St, Palatine' }), [], ctx(), config, NOW);
  let task: AgentTask = { ...newTaskRow({ type: 'JOB_INTAKE', subjectType: 'job', subjectId: 'job-1', idempotencyKey: 'k', priority: 1 }, 't1', NOW), state: 'awaiting_approval', draft };
  for (let i = 0; i < 2; i++) {
    task = applyDecision(task, { admin: 'a', decision: 'reject', reason: 'tone' }, config, NOW).task;
    assert.equal(task.state, 'queued');
    task = { ...task, state: 'awaiting_approval', draft };
  }
  task = applyDecision(task, { admin: 'a', decision: 'reject', reason: 'tone' }, config, NOW).task;
  assert.equal(task.state, 'closed');
  assert.throws(() => applyDecision({ ...task, state: 'awaiting_approval' }, { admin: 'a', decision: 'reject' }, config, NOW), DecisionError);
});

// ---------------------------------------------------------------- recruiter (A4)

test('recruiter: open snow jobs and no snow Butlers make an urgent gap card without addresses', async () => {
  const jobs = [job({ service: 'Snow shoveling', details: 'Shovel the driveway' }), job({ id: 'job-2', service: 'Snow shoveling', details: 'Shovel the walk', phone: '847-555-0199', email: '' })];
  const cells = supplyTable(jobs, [butler({ id: 'b1' })], config, NOW);
  assert.equal(cells[0].service, 'Snow shoveling');
  assert.equal(cells[0].supply, 0);
  const planned = planRecruiting(jobs, [butler({ id: 'b1' })], new Map(), config, NOW);
  const gap = planned.find((t) => t.subjectId === 'gap|Barrington|Snow shoveling');
  assert.equal(gap?.priority, 3);
  const result = await runRecruiter(gap!.subjectId, jobs, [butler({ id: 'b1' })], ctx(), config, NOW);
  assert.ok('draft' in result);
  if ('draft' in result) {
    assert.equal(result.draft.action.kind, 'post_groupme');
    assert.equal(result.draft.variants.length, 2);
    assert.doesNotMatch(result.draft.variants.join(' '), /Maple/);
  }
});

test('recruiter: a gap that has been filled closes instead of showing a card', async () => {
  const jobs = [job()];
  const crew = ['b1', 'b2', 'b3'].map((id) => butler({ id }));
  const result = await runRecruiter('gap|Barrington|Yard work', jobs, crew, ctx(), config, NOW);
  assert.ok('close' in result);
});

test('recruiter: plans the snow-season push in the six weeks before December', () => {
  const lateOct = new Date('2026-10-25T15:00:00Z');
  assert.ok(planRecruiting([], [], new Map(), config, lateOct).some((t) => t.idempotencyKey === 'recruit:season:Snow shoveling:2026'));
  assert.ok(!planRecruiting([], [], new Map(), config, NOW).some((t) => t.idempotencyKey.startsWith('recruit:season')));
});

test('recruiter: unfinished profiles, waiting reviews and quiet Butlers each get one card', async () => {
  const roster = [
    butler({ id: 'new', name: 'Nia', profileStatus: 'Draft', approved: false, signedUpAt: '2026-10-12T00:00:00Z' }),
    butler({ id: 'wait', name: 'Will', profileStatus: 'Pending', approved: false, signedUpAt: '2026-10-10T00:00:00Z' }),
    butler({ id: 'quiet', name: 'Quinn', signedUpAt: '2026-08-01T00:00:00Z' }),
  ];
  const keys = planRecruiting([], roster, new Map(), config, NOW).map((t) => t.subjectId);
  assert.ok(keys.includes('nudge') && keys.includes('pending') && keys.includes('inactive'));
  const nudge = await runRecruiter('nudge', [], roster, ctx(), config, NOW);
  assert.ok('draft' in nudge && nudge.draft.action.kind === 'notify_butlers' && nudge.draft.action.butlerIds.join() === 'new');
  const pending = await runRecruiter('pending', [], roster, ctx(), config, NOW);
  assert.ok('draft' in pending && pending.draft.channel === 'internal');
});

test('recruiter: lots of Butlers and no work suggests a Nextdoor post for that town', async () => {
  const crew = ['a', 'b', 'c'].map((id) => butler({ id, serviceArea: 'Arlington Heights' }));
  const planned = planRecruiting([], crew, new Map(), config, NOW);
  assert.ok(planned.some((t) => t.subjectId === 'surplus|Arlington Heights'));
  const result = await runRecruiter('surplus|Arlington Heights', [], crew, ctx(), config, NOW);
  assert.ok('draft' in result && result.draft.action.kind === 'manual_post' && result.draft.channel === 'nextdoor');
});

// ---------------------------------------------------------------- b2b + web studio (A6)

function prospect(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'p1', channel: 'b2b', text: 'Lists 6 homes a month in Barrington', town: 'Barrington', author: 'Blaise', status: 'new',
    details: { org: 'Oak Realty', segment: 'realtor', contactName: 'Dana Lee', email: 'dana@oakrealty.example' },
    createdAt: '2026-10-01T15:00:00Z', ...overrides,
  };
}

test('b2b: first email, then follow-ups on day 5 and 12, and nothing after a reply', () => {
  assert.deepEqual(planOutreach([prospect()], new Map(), config, NOW).map((t) => t.idempotencyKey), ['lead:p1:b2b:0']);
  const contacted = prospect({ status: 'contacted' });
  const index = new Map([['lead:p1:b2b:0', { createdAt: '2026-10-01T15:00:00Z', state: 'done' }]]);
  assert.deepEqual(planOutreach([contacted], index, config, NOW).map((t) => t.idempotencyKey), ['lead:p1:b2b:1']);
  index.set('lead:p1:b2b:1', { createdAt: '2026-10-06T15:00:00Z', state: 'done' });
  assert.deepEqual(planOutreach([contacted], index, config, NOW).map((t) => t.idempotencyKey), ['lead:p1:b2b:2']);
  index.set('lead:p1:b2b:2', { createdAt: '2026-10-13T15:00:00Z', state: 'done' });
  assert.deepEqual(planOutreach([contacted], index, config, NOW), [], 'three touches at most');
  assert.deepEqual(planOutreach([prospect({ status: 'replied' })], new Map(), config, NOW), []);
});

test('b2b: a qualified realtor gets an email; no email address means drop', async () => {
  const ok = await runOutreach(prospect(), 0, ctx(), config);
  assert.ok('draft' in ok);
  if ('draft' in ok) {
    assert.equal(ok.draft.action.kind, 'send_email');
    assert.match(ok.draft.text, /Dana/);
    assert.deepEqual(ok.draft.safety.messageProblems, []);
  }
  const bad = await runOutreach(prospect({ details: { org: 'X', segment: 'realtor' } }), 0, ctx(), config);
  assert.ok('close' in bad && bad.leadStatus === 'dropped');
  const far = await runOutreach(prospect({ town: 'Des Plaines', text: '' }), 0, ctx(), config);
  assert.ok('close' in far);
});

test('web studio: picks the package from pages, features and budget', () => {
  assert.equal(pickTier(3, null, 'simple site', config).name, 'Starter');
  assert.equal(pickTier(3, 1000, 'we want a photo gallery', config).name, 'Standard');
  assert.equal(pickTier(4, null, 'online store for candles', config).name, 'Plus');
});

test('web studio: under-budget inquiries get a kind referral; good ones get a proposal; won ones get a brief', async () => {
  const web = (budget: string, text = 'Bakery site with menu and photos') =>
    prospect({ channel: 'web', text, details: { org: 'Rise Bakery', contactName: 'Sam', email: 'sam@rise.example', budget } });
  const low = await runWebLead(web('400'), ctx(), config);
  assert.ok('draft' in low && low.draft.action.kind === 'send_email' && low.draft.action.leadStatus === 'dropped');
  const good = await runWebLead(web('1000'), ctx(), config);
  assert.ok('draft' in good);
  if ('draft' in good) {
    assert.match(good.draft.title, /Standard \(\$950\)/);
    assert.doesNotMatch(good.draft.text, /guarantee/i);
  }
  const brief = await runWebBrief({ ...web('1000'), status: 'won' }, ctx(), config);
  assert.ok('draft' in brief && brief.draft.channel === 'internal' && /QA CHECKLIST/.test(brief.draft.text));
});

// ---------------------------------------------------------------- analyst (A9)

test('analyst: repeated waitlist requests from a town propose serving it', () => {
  const waitlisted = Array.from({ length: 5 }, (_, i) =>
    job({ id: `w${i}`, address: `${i} Elm, Palatine, IL`, status: 'Rejected', rejectNote: 'Outside our service area (Palatine) — waitlisted' }));
  const proposals = findProposals({ jobs: waitlisted, tasks: [], runs: [], leads: [] }, config, NOW);
  const town = proposals.find((p) => p.id === 'activate-town|Palatine');
  assert.ok(town);
  const areas = town!.patch!.serviceAreas as { town: string; active: boolean }[];
  assert.equal(areas.find((a) => a.town === 'Palatine')?.active, true);
  assert.equal(areas.length, config.serviceAreas.length);
});

test('analyst: an agent whose drafts keep getting rewritten is flagged for review', async () => {
  const { draft } = await runIntake(job(), [], ctx(), config, NOW);
  const decided = (decision: 'approve' | 'edit' | 'reject', i: number): AgentTask => ({
    ...newTaskRow({ type: 'JOB_INTAKE', subjectType: 'job', subjectId: `j${i}`, idempotencyKey: `k${i}`, priority: 1 }, `t${i}`, NOW),
    state: 'done', draft, decisions: [{ admin: 'a', decision, reason: decision === 'reject' ? 'tone' : '', finalText: '', at: NOW.toISOString() }],
  });
  const tasks = [decided('approve', 1), decided('edit', 2), decided('edit', 3), decided('reject', 4), decided('edit', 5)];
  const proposals = findProposals({ jobs: [], tasks, runs: [], leads: [] }, config, NOW);
  const review = proposals.find((p) => p.id === 'agent-review|intake');
  assert.ok(review && review.patch === null);
  const card = runProposal('agent-review|intake', { jobs: [], tasks, runs: [], leads: [] }, config, NOW);
  assert.ok('draft' in card && card.draft.action.kind === 'acknowledge');
});

test('analyst: the weekly review is planned once, after Monday morning', () => {
  const input = { jobs: [], tasks: [], runs: [], leads: [] };
  assert.deepEqual(planAnalyst(input, new Map(), config, new Date('2026-10-19T10:00:00Z')), [], 'before 7am Chicago on Monday');
  const monday = planAnalyst(input, new Map(), config, new Date('2026-10-19T13:00:00Z'));
  assert.deepEqual(monday.map((t) => t.idempotencyKey), ['review:2026-W43']);
  assert.deepEqual(planAnalyst(input, new Map([['review:2026-W43', {}]]), config, new Date('2026-10-21T13:00:00Z')), []);
});

test('analyst: the digest counts the week and uses the model only for the focus line', async () => {
  const jobs = [job(), job({ id: 'j2', status: 'Completed', rating: 5, completedAt: NOW.toISOString(), assignedButlerId: 'b1', assignedAt: '2026-10-16T12:00:00Z' })];
  const plain = await runWeeklyReview({ jobs, tasks: [], runs: [], leads: [] }, ctx(), config, NOW);
  assert.match(plain.draft.text, /Requests: 2 new/);
  assert.match(plain.draft.text, /Completed: 1\. Average rating 5\.0/);
  const llm: Llm = async () => ({ data: { focus: 'Recruit snow help in Barrington this week.' }, inputTokens: 10, outputTokens: 10 });
  const withModel = await runWeeklyReview({ jobs, tasks: [], runs: [], leads: [] }, ctx(llm), config, NOW);
  assert.match(withModel.draft.summary, /Recruit snow help/);
  assert.equal(withModel.draft.source, 'model');
});

test('decisions: approving a config proposal hands the patch to the Executor', () => {
  const draft = {
    agent: 'analyst' as const, title: 'Raise budget', summary: '', text: '', variants: [], channel: 'none' as const,
    action: { kind: 'apply_config' as const, patch: { monthlyBudgetUsd: 30 }, summary: 'Raise budget' },
    safety: GREEN, voice: null, confidence: 1, source: 'template' as const, revisions: 0, flags: [], facts: [],
  };
  const task: AgentTask = { ...newTaskRow({ type: 'CONFIG_PROPOSAL', subjectType: 'system', subjectId: 'budget|30', idempotencyKey: 'k', priority: 2 }, 't1', NOW), state: 'awaiting_approval', draft };
  const outcome = applyDecision(task, { admin: 'a', decision: 'approve' }, config, NOW);
  assert.deepEqual(outcome.execute?.action, draft.action);
});

test('lead statuses only move forward', () => {
  assert.equal(leadStatusAdvances('new', 'contacted'), true);
  assert.equal(leadStatusAdvances('won', 'contacted'), false, 'a late proposal email must not undo Won');
  assert.equal(leadStatusAdvances('replied', 'contacted'), false);
  assert.equal(leadStatusAdvances('new', 'dropped'), true);
});
