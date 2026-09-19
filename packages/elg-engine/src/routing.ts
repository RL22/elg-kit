/**
 * @file routing.ts
 * Maps an author's job title to the perspective that fits them best.
 * Reference data showed the angle of an employee's post follows their role, not the event,
 * so the engine leads with the matching angle instead of treating all five as equal.
 */

import { PERSPECTIVE_ROLES, PerspectiveRole } from './types.js';

/**
 * Order matters: the first matching rule wins, so more specific titles come first.
 * "Product Marketing Manager" is GTM, "Engineering Recruiter" is Talent, "Solutions Engineer" is GTM.
 */
const ROLE_RULES: ReadonlyArray<{ perspective: PerspectiveRole; pattern: RegExp }> = [
  {
    perspective: 'talent',
    pattern: /\b(recruit\w*|talent|sourcer|hiring manager|human resources|hr|people|chief people)\b/i,
  },
  {
    perspective: 'gtm',
    pattern: /\b(product marketing|pmm|marketing|sales|account (executive|manager|director)|ae|sdr|bdr|business development|customer success|revenue|partnerships?|solutions? (engineer|architect|consultant)|growth|demand gen\w*|gtm|go-to-market|cro|cmo)\b/i,
  },
  {
    perspective: 'visionary',
    pattern: /\b(ceo|chief executive|founder|co-founder|cofounder|(?<!vice[ -])president|chairman|managing director)\b/i,
  },
  {
    perspective: 'product',
    pattern: /\b(product (manager|management|designer|design|lead|owner)|head of product|(s?vp|vice president),? (of )?product|chief product|cpo|designer|design|ux|ui|user research\w*|researcher)\b/i,
  },
  {
    perspective: 'builder',
    pattern: /\b(engineer\w*|developer\w*|software|sre|devops|architect\w*|infrastructure|platform|cto|chief technology|technical staff|machine learning|data scientist|programmer|devrel)\b/i,
  },
];

/**
 * Returns the perspective that best fits a job title, or null when the title is empty or unrecognized.
 */
export function perspectiveForRole(title?: string | null): PerspectiveRole | null {
  const text = (title || '').trim();
  if (!text) return null;
  // A chief of staff is an operating role, not the CEO's perspective.
  if (/\bchief of staff\b/i.test(text)) return null;
  for (const rule of ROLE_RULES) {
    if (rule.pattern.test(text)) return rule.perspective;
  }
  return null;
}

/**
 * Returns all five perspectives with the role-matched one first. Unknown roles keep the default order.
 */
export function orderPerspectivesForRole(title?: string | null): PerspectiveRole[] {
  const primary = perspectiveForRole(title);
  if (!primary) return [...PERSPECTIVE_ROLES];
  return [primary, ...PERSPECTIVE_ROLES.filter((r) => r !== primary)];
}
