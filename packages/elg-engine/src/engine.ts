/**
 * @file engine.ts
 * Core orchestrator for the ELG Perspective Engine.
 * Coordinates prompt compilation, anti-cringe filtering, link separation,
 * and structured JSON delivery across the five role angles.
 */

import {
  filterAntiCringe,
} from './anti-cringe.js';
import {
  DEFAULT_REDIRECT_HOST,
  formatFirstComment,
  formatPerspectivePost,
  stripLinks,
} from './formatter.js';
import {
  generateQuintuplePrompt,
  generateRolePrompt,
  getSystemPrompt,
  normalizeMilestone,
} from './prompts.js';
import {
  AntiCringeOptions,
  MilestonePayload,
  NormalizedMilestone,
  PERSPECTIVE_ROLES,
  PerspectiveEngineResult,
  PerspectiveOutput,
  PerspectiveRole,
  PromptOptions,
} from './types.js';

export interface RawPerspectiveItem {
  title?: string;
  post_body?: string;
  text?: string;
  body?: string;
}

export type RawPerspectiveInput =
  | string
  | RawPerspectiveItem;

export type RawQuintupleInputs = Record<PerspectiveRole, RawPerspectiveInput>;

/**
 * Format a single raw perspective completion into the hardened schema.
 */
export function processPerspective(
  role: PerspectiveRole,
  raw: RawPerspectiveInput,
  milestone: MilestonePayload,
  antiCringeOptions?: AntiCringeOptions
): PerspectiveOutput {
  const norm = normalizeMilestone(milestone);

  let rawBody = '';
  let title = `${role.toUpperCase()} Perspective`;

  if (typeof raw === 'string') {
    rawBody = raw;
  } else if (typeof raw === 'object' && raw !== null) {
    rawBody = raw.post_body || raw.text || raw.body || '';
    if (raw.title) {
      title = raw.title;
    }
  }

  return formatPerspectivePost(rawBody, {
    role,
    title,
    memberSlug: norm.memberSlug,
    targetUrl: norm.targetUrl,
    redirectHost: norm.redirectHost,
    antiCringeOptions,
  });
}

/**
 * Assemble all five perspectives into the finalized structured result.
 */
export function formatEngineResult(
  rawInputs: Partial<Record<PerspectiveRole, RawPerspectiveInput>>,
  milestone: MilestonePayload,
  antiCringeOptions?: AntiCringeOptions
): PerspectiveEngineResult {
  const norm = normalizeMilestone(milestone);

  const perspectives = {} as Record<PerspectiveRole, PerspectiveOutput>;

  for (const role of PERSPECTIVE_ROLES) {
    const raw = rawInputs[role] || '';
    perspectives[role] = processPerspective(role, raw, milestone, antiCringeOptions);
  }

  return {
    milestone_title: norm.title,
    author: norm.author.name,
    member_slug: norm.memberSlug,
    target_url: norm.targetUrl,
    redirect_host: norm.redirectHost,
    perspectives: {
      builder: perspectives.builder,
      gtm: perspectives.gtm,
      talent: perspectives.talent,
      visionary: perspectives.visionary,
      product: perspectives.product,
    },
    generated_at: new Date().toISOString(),
  };
}

/**
 * Validate that a perspective result adheres strictly to PRD Module 4 & 5 requirements.
 */
export function validateEngineResult(result: PerspectiveEngineResult): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!result.milestone_title) {
    errors.push('Missing milestone_title');
  }
  if (!result.member_slug) {
    errors.push('Missing member_slug');
  }

  for (const role of PERSPECTIVE_ROLES) {
    const p = result.perspectives[role];
    if (!p) {
      errors.push(`Missing perspective for role: ${role}`);
      continue;
    }

    // Check link placement policy in post_body
    if (/https?:\/\//i.test(p.post_body)) {
      errors.push(`Role ${role} post_body contains external link, violating the link placement policy`);
    }

    // Check first_comment contains attributed link
    if (!p.first_comment.includes(`/e/${result.member_slug}`)) {
      errors.push(`Role ${role} first_comment does not contain attributed member link`);
    }

    // Check for forbidden emojis
    if (/[\u{1F680}\u{1F525}\u{1F389}\u{1F4AA}]/u.test(p.post_body)) {
      errors.push(`Role ${role} post_body contains forbidden emojis`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * PerspectiveEngine class encapsulating the prompt generation,
 * formatting, and anti-cringe pipeline.
 */
export class PerspectiveEngine {
  private defaultOptions: AntiCringeOptions;
  private redirectHost: string;

  constructor(options: {
    antiCringeOptions?: AntiCringeOptions;
    redirectHost?: string;
  } = {}) {
    this.defaultOptions = options.antiCringeOptions || {};
    this.redirectHost = options.redirectHost || DEFAULT_REDIRECT_HOST;
  }

  getSystemPrompt(): string {
    return getSystemPrompt();
  }

  generateQuintuplePrompt(milestone: MilestonePayload, options?: PromptOptions): string {
    return generateQuintuplePrompt(
      { redirectHost: this.redirectHost, ...milestone },
      options
    );
  }

  generateRolePrompt(
    role: PerspectiveRole,
    milestone: MilestonePayload,
    options?: PromptOptions
  ): string {
    return generateRolePrompt(
      role,
      { redirectHost: this.redirectHost, ...milestone },
      options
    );
  }

  processPerspective(
    role: PerspectiveRole,
    raw: RawPerspectiveInput,
    milestone: MilestonePayload,
    options?: AntiCringeOptions
  ): PerspectiveOutput {
    return processPerspective(
      role,
      raw,
      { redirectHost: this.redirectHost, ...milestone },
      { ...this.defaultOptions, ...options }
    );
  }

  formatResult(
    rawInputs: Partial<Record<PerspectiveRole, RawPerspectiveInput>>,
    milestone: MilestonePayload,
    options?: AntiCringeOptions
  ): PerspectiveEngineResult {
    return formatEngineResult(
      rawInputs,
      { redirectHost: this.redirectHost, ...milestone },
      { ...this.defaultOptions, ...options }
    );
  }

  validateResult(result: PerspectiveEngineResult) {
    return validateEngineResult(result);
  }
}
