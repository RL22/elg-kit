/**
 * @file types.ts
 * Core types and schemas for the ELG Perspective Engine.
 */

export type PerspectiveRole = 'builder' | 'gtm' | 'talent' | 'visionary' | 'product';

export const PERSPECTIVE_ROLES: readonly PerspectiveRole[] = [
  'builder',
  'gtm',
  'talent',
  'visionary',
  'product',
] as const;

export interface GitAuthor {
  name: string;
  email?: string;
  username?: string;
}

export interface TechnicalDetails {
  architecture?: string;
  tradeoffs?: string;
  benchmarks?: string;
  whatAlmostBroke?: string;
  failureModes?: string;
}

export interface BusinessMetrics {
  painSolved?: string;
  metricsImproved?: string;
  buyerRelevance?: string;
  roi?: string;
}

export interface ProductWorkflowDetails {
  frictionEliminated?: string;
  usabilityTradeoffs?: string;
  dayToDayImpact?: string;
}

export interface MilestonePayload {
  title: string;
  changelogSummary?: string;
  changelog_summary?: string;
  author: string | GitAuthor;
  authorRole?: string;
  author_role?: string;
  issueReferences?: string[];
  issue_references?: string[];
  targetUrl?: string;
  target_url?: string;
  memberSlug?: string;
  member_slug?: string;
  member?: string;
  redirectHost?: string;
  redirect_host?: string;
  openRoles?: string[];
  open_roles?: string[];
  styleSample?: string;
  style_sample?: string;
  technicalDetails?: TechnicalDetails;
  technical_details?: TechnicalDetails;
  businessMetrics?: BusinessMetrics;
  business_metrics?: BusinessMetrics;
  productWorkflow?: ProductWorkflowDetails;
  product_workflow?: ProductWorkflowDetails;
  visionaryThesis?: string;
  visionary_thesis?: string;
}

export interface NormalizedMilestone {
  title: string;
  changelogSummary: string;
  author: GitAuthor;
  authorRole?: string;
  issueReferences: string[];
  targetUrl?: string;
  memberSlug: string;
  redirectHost: string;
  openRoles: string[];
  styleSample?: string;
  technicalDetails?: TechnicalDetails;
  businessMetrics?: BusinessMetrics;
  productWorkflow?: ProductWorkflowDetails;
  visionaryThesis?: string;
}

export interface PerspectiveMetadata {
  word_count: number;
  character_count: number;
  within_word_budget: boolean;
  detected_buzzwords_removed: string[];
  forbidden_emojis_removed: string[];
  rhetorical_questions_removed: string[];
  links_extracted: string[];
}

export interface PerspectiveOutput {
  role: PerspectiveRole;
  title: string;
  post_body: string;
  first_comment: string;
  metadata: PerspectiveMetadata;
}

export interface PerspectiveEngineResult {
  milestone_title: string;
  author: string;
  member_slug: string;
  target_url?: string;
  redirect_host: string;
  /** Perspective that best fits the author's role, or null when the role is unknown. */
  recommended_perspective: PerspectiveRole | null;
  perspectives: {
    builder: PerspectiveOutput;
    gtm: PerspectiveOutput;
    talent: PerspectiveOutput;
    visionary: PerspectiveOutput;
    product: PerspectiveOutput;
  };
  generated_at: string;
}

export interface AntiCringeOptions {
  stripHype?: boolean;
  stripEmojis?: boolean;
  stripRhetorical?: boolean;
  minWords?: number;
  maxWords?: number;
  customBannedWords?: string[];
}

export interface FilterResult {
  cleaned: string;
  removedHype: string[];
  removedEmojis: string[];
  removedRhetorical: string[];
  extractedLinks: string[];
  wordCount: number;
  charCount: number;
  withinBudget: boolean;
}

export interface WordBudgetResult {
  valid: boolean;
  wordCount: number;
  charCount: number;
  minWords: number;
  maxWords: number;
  status: 'under_budget' | 'in_budget' | 'over_budget';
  message?: string;
}

export interface FormatPostOptions {
  role: PerspectiveRole;
  title?: string;
  memberSlug: string;
  targetUrl?: string;
  redirectHost?: string;
  antiCringeOptions?: AntiCringeOptions;
}

export interface PromptOptions {
  styleSample?: string;
  customDirectives?: string;
  minWords?: number;
  maxWords?: number;
}
