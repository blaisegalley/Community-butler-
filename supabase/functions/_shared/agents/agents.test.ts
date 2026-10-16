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
  const lead: Lead = { id: 'l1', channel: 'nextdoor', text: 'Does anyone know a teen who can shovel snow in Barrington tomorrow?', town: '', author: 'Blaise', status: 'new', createdAt: NOW.toISOString() };
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
  };
}

test('dispatcher: new job ends up as a card awaiting approval', async () => {
  const io = memoryIO([job()], []);
  const summary = await runDispatcher(io);
  assert.equal(summary.enqueued, 1);
  assert.equal(summary.awaitingApproval, 1);
  assert.equal(io.tasks[0].state, 'awaiting_approval');
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
