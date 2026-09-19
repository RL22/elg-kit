import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PERSPECTIVE_ROLES,
  PerspectiveEngine,
  formatEngineResult,
  generateQuintuplePrompt,
  generateRolePrompt,
  orderPerspectivesForRole,
  perspectiveForRole,
} from '../src/index.js';

test('perspectiveForRole maps common job titles to the fitting perspective', () => {
  const cases: Array<[string, string]> = [
    ['Staff Software Engineer', 'builder'],
    ['VP Engineering', 'builder'],
    ['Site Reliability Engineer', 'builder'],
    ['Chief Technology Officer', 'builder'],
    ['Account Executive', 'gtm'],
    ['Product Marketing Manager', 'gtm'],
    ['Solutions Engineer', 'gtm'],
    ['Head of Growth', 'gtm'],
    ['Chief Revenue Officer', 'gtm'],
    ['Technical Recruiter', 'talent'],
    ['Engineering Recruiter', 'talent'],
    ['Head of People', 'talent'],
    ['Co-Founder & CEO', 'visionary'],
    ['Founder', 'visionary'],
    ['Product Manager', 'product'],
    ['Senior Product Designer', 'product'],
    ['Head of Design', 'product'],
    ['UX Researcher', 'product'],
    ['Chief Product Officer', 'product'],
    ['Vice President of Engineering', 'builder'],
    ['Vice President, Product', 'product'],
    ['SVP Product', 'product'],
    ['Program Manager, People', 'talent'],
    ['President & CEO', 'visionary'],
    ['Sales Engineer', 'gtm'],
    ['Founding Engineer', 'builder'],
  ];
  for (const [title, expected] of cases) {
    assert.equal(perspectiveForRole(title), expected, `${title} should map to ${expected}`);
  }
});

test('perspectiveForRole returns null for empty or unrecognized titles', () => {
  assert.equal(perspectiveForRole(''), null);
  assert.equal(perspectiveForRole(undefined), null);
  assert.equal(perspectiveForRole(null), null);
  assert.equal(perspectiveForRole('Office Manager'), null);
  assert.equal(perspectiveForRole('Chief of Staff to the CEO'), null);
});

test('orderPerspectivesForRole puts the match first and keeps all five', () => {
  const ordered = orderPerspectivesForRole('Account Executive');
  assert.equal(ordered[0], 'gtm');
  assert.equal(ordered.length, 5);
  assert.deepEqual([...ordered].sort(), [...PERSPECTIVE_ROLES].sort());
  assert.deepEqual(orderPerspectivesForRole('Office Manager'), [...PERSPECTIVE_ROLES]);
});

test('quintuple prompt leads with the role-matched perspective and names the author role', () => {
  const prompt = generateQuintuplePrompt({
    title: 'Edge cache invalidation shipped',
    author: 'Sam Rivera',
    authorRole: 'Product Marketing Manager',
  });
  assert.ok(prompt.includes('AUTHOR ROLE: Product Marketing Manager'));
  assert.ok(prompt.includes('AUTHOR ROLE MATCH'));
  assert.ok(prompt.indexOf('1. gtm:') !== -1, 'GTM should be listed first');
  assert.ok(prompt.indexOf('1. gtm:') < prompt.indexOf('2. builder:'));
  for (const role of PERSPECTIVE_ROLES) assert.ok(prompt.includes(`${role}:`), `${role} must still be generated`);
});

test('quintuple prompt is unchanged in order when the role is unknown or missing', () => {
  const withoutRole = generateQuintuplePrompt({ title: 'Release', author: 'Sam' });
  assert.ok(withoutRole.indexOf('1. builder:') !== -1);
  assert.ok(!withoutRole.includes('AUTHOR ROLE'));
  const unknown = generateQuintuplePrompt({ title: 'Release', author: 'Sam', authorRole: 'Office Manager' });
  assert.ok(unknown.indexOf('1. builder:') !== -1);
  assert.ok(!unknown.includes('AUTHOR ROLE MATCH'));
});

test('snake_case author_role is accepted and appears in single-role prompts', () => {
  const prompt = generateRolePrompt('talent', { title: 'Release', author: 'Sam', author_role: 'Technical Recruiter' });
  assert.ok(prompt.includes('AUTHOR ROLE: Technical Recruiter'));
});

test('engine results carry recommended_perspective', () => {
  const raw = { builder: 'a', gtm: 'b', talent: 'c', visionary: 'd', product: 'e' };
  const known = formatEngineResult(raw, { title: 'Release', author: 'Sam', authorRole: 'Senior Product Designer' });
  assert.equal(known.recommended_perspective, 'product');
  const unknown = formatEngineResult(raw, { title: 'Release', author: 'Sam' });
  assert.equal(unknown.recommended_perspective, null);
  assert.equal(new PerspectiveEngine().recommendPerspective('Account Executive'), 'gtm');
});
