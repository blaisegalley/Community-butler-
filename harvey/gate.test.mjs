// Run with: npm run test:harvey
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkEmail, isOptOut, emailKey } from './gate.mjs';

const good = {
  to: 'jane@northshorehomes.com',
  subject: 'Your Hough St listing',
  body: 'Saw the new listing on Hough St go up this week. The front beds have a lot of leaves in them right now. A couple of us from Barrington High could rake and bag the yard before your first showing weekend. Want me to send over what that would look like?',
  step: 1,
  track: 'A',
};

test('a short, specific agent email passes', () => {
  const r = checkEmail(good);
  assert.equal(r.ok, true, r.reasons.join('; '));
});

test('word limits depend on the step', () => {
  const long = { ...good, body: 'word '.repeat(76) };
  assert.match(checkEmail(long).reasons.join(), /76 words \(step 1 max is 75\)/);
  assert.equal(checkEmail({ ...long, step: 'reply' }).ok, true);
});

test('agent emails cannot quote prices', () => {
  const r = checkEmail({ ...good, body: `${good.body} It is $40.` });
  assert.match(r.reasons.join(), /must not quote prices/);
});

test('website prices must stay in the $700 to $1,250 range', () => {
  const site = { ...good, track: 'B', subject: 'Your shop site' };
  assert.equal(checkEmail({ ...site, body: 'Sites run $700 to $1,250 depending on size.' }).ok, true);
  assert.match(checkEmail({ ...site, body: 'Sites start at $500.' }).reasons.join(), /\$500 is outside/);
  assert.match(checkEmail({ ...site, body: 'This one is $2,000.' }).reasons.join(), /\$2000 is outside/);
});

test('catches placeholders, hype words, fake replies and formatting', () => {
  const r = checkEmail({
    ...good,
    subject: 'Re: quick question',
    body: 'Hi [First Name], I hope this finds you well! We leverage students!\n- raking\n- mowing',
  });
  const all = r.reasons.join(' | ');
  assert.match(all, /unfilled placeholder/);
  assert.match(all, /banned phrases/);
  assert.match(all, /fakes a reply/);
  assert.match(all, /exclamation marks/);
  assert.match(all, /bullets/);
});

test('first email has no links; later ones get at most one', () => {
  const withLink = { ...good, body: `${good.body} https://thecommunitybutler.com` };
  assert.match(checkEmail(withLink).reasons.join(), /must not contain links/);
  assert.equal(checkEmail({ ...withLink, step: 2, body: 'Still happy to help with the yard. https://thecommunitybutler.com' }).ok, true);
});

test('blocks opted-out and mismatched recipients', () => {
  const r = checkEmail({ ...good, prospectEmail: 'other@x.com', optedOut: ['JANE@northshorehomes.com'] });
  assert.match(r.reasons.join(), /opted out/);
  assert.match(r.reasons.join(), /does not match/);
});

test('recognises opt-out replies but not ordinary ones', () => {
  assert.equal(isOptOut('Please remove me from your list'), true);
  assert.equal(isOptOut('stop'), true);
  assert.equal(isOptOut('Not interested, thanks'), true);
  assert.equal(isOptOut('Sure, can you come Saturday?'), false);
  assert.equal(isOptOut("If you'd rather I didn't email again, just say so and I won't."), false);
});

test('emailKey makes a safe document id', () => {
  assert.equal(emailKey(' Jane.Doe+x@Shop.com '), 'jane_doe_x_shop_com');
});
