import { kv } from '@vercel/kv';

export interface WritingSample {
  id: string;
  text: string;
  submittedAt: string;
  wordCount: number;
}

export interface StyleFingerprint {
  avgSentenceLength: number;
  avgWordsPerPost: number;
  punctuationStyle: 'minimal' | 'expressive' | 'standard';
  vocabularyTone: 'technical' | 'conversational' | 'analytical';
  formattingStyle: 'short-paragraphs' | 'bulleted' | 'narrative';
}

export interface MemberVoiceProfile {
  userId: string;
  handle: string;
  samples: WritingSample[];
  styleFingerprint: StyleFingerprint;
  snoozeUntil: string | null;
  optOut: boolean;
  updatedAt: string;
}

/**
 * In-memory storage fallback for local development or environments
 * without Vercel KV REST API configured.
 */
const localMemoryStore = new Map<string, string>();

async function getFromStore<T>(key: string): Promise<T | null> {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      return await kv.get<T>(key);
    } catch (err) {
      console.warn(`[voice-profiler] Vercel KV read failed for key ${key}, falling back to local memory:`, err);
    }
  }
  const raw = localMemoryStore.get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

async function setToStore<T>(key: string, value: T): Promise<void> {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      await kv.set(key, value);
      return;
    } catch (err) {
      console.warn(`[voice-profiler] Vercel KV write failed for key ${key}, falling back to local memory:`, err);
    }
  }
  localMemoryStore.set(key, JSON.stringify(value));
}

/**
 * Analyzes writing samples to extract stylometric fingerprint.
 */
function analyzeStyle(samples: WritingSample[]): StyleFingerprint {
  if (samples.length === 0) {
    return {
      avgSentenceLength: 14,
      avgWordsPerPost: 180,
      punctuationStyle: 'standard',
      vocabularyTone: 'technical',
      formattingStyle: 'short-paragraphs',
    };
  }

  const allTexts = samples.map((s) => s.text).join(' ');
  const words = allTexts.split(/\s+/).filter(Boolean);
  const sentences = allTexts.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  const avgSentenceLength = Math.round(words.length / Math.max(sentences.length, 1));
  const avgWordsPerPost = Math.round(
    samples.reduce((acc, s) => acc + s.wordCount, 0) / samples.length
  );

  const exclamationCount = (allTexts.match(/!/g) || []).length;
  const dashCount = (allTexts.match(/—|-/g) || []).length;

  const punctuationStyle: StyleFingerprint['punctuationStyle'] =
    exclamationCount > 3 ? 'expressive' : dashCount > 2 ? 'minimal' : 'standard';

  const hasCodeOrTechnicalTerms = /\b(api|latency|rfc|pr|sql|p99|cache|worker|branch|async|sdk)\b/i.test(
    allTexts
  );

  const vocabularyTone: StyleFingerprint['vocabularyTone'] = hasCodeOrTechnicalTerms
    ? 'technical'
    : 'conversational';

  const hasBullets = /(?:^|\n)[-•*]\s+/m.test(allTexts);
  const formattingStyle: StyleFingerprint['formattingStyle'] = hasBullets
    ? 'bulleted'
    : 'short-paragraphs';

  return {
    avgSentenceLength,
    avgWordsPerPost,
    punctuationStyle,
    vocabularyTone,
    formattingStyle,
  };
}

/**
 * Voice Profiler Service using Eve durable key-value memory.
 * Stores up to 3 writing samples per member.
 */
export class VoiceProfiler {
  private static getKey(userId: string): string {
    return `elg:voice:${userId}`;
  }

  /**
   * Save a writing sample for a team member (up to 3 samples max).
   * If member already has 3 samples, drops oldest (FIFO).
   */
  static async saveWritingSample(
    userId: string,
    handle: string,
    sampleText: string
  ): Promise<MemberVoiceProfile> {
    const trimmed = sampleText.trim();
    if (!trimmed) {
      throw new Error('Writing sample cannot be empty');
    }

    const words = trimmed.split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    const existing = await this.getVoiceProfile(userId);
    let samples: WritingSample[] = existing ? [...existing.samples] : [];

    const newSample: WritingSample = {
      id: `sample_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      text: trimmed,
      submittedAt: new Date().toISOString(),
      wordCount,
    };

    // Keep up to 3 samples (FIFO)
    if (samples.length >= 3) {
      samples.shift(); // Remove oldest
    }
    samples.push(newSample);

    const styleFingerprint = analyzeStyle(samples);

    const profile: MemberVoiceProfile = {
      userId,
      handle: handle || (existing?.handle ?? userId),
      samples,
      styleFingerprint,
      snoozeUntil: existing?.snoozeUntil ?? null,
      optOut: existing?.optOut ?? false,
      updatedAt: new Date().toISOString(),
    };

    await setToStore(this.getKey(userId), profile);

    // Also register member ID in active member set for scheduled jobs
    await this.registerActiveMember(userId);

    return profile;
  }

  /**
   * Retrieves member voice profile by Slack user ID.
   */
  static async getVoiceProfile(userId: string): Promise<MemberVoiceProfile | null> {
    return await getFromStore<MemberVoiceProfile>(this.getKey(userId));
  }

  /**
   * Generates prompt injection guidelines tailored to this member's writing style.
   */
  static async getVoicePromptInjection(userId: string): Promise<string> {
    const profile = await this.getVoiceProfile(userId);
    if (!profile || profile.samples.length === 0) {
      return `\n### Member Voice Profile: Default Authentic Builder
- Target word count: 180-240 words
- Tone: Direct, technical, conversational
- Structure: Short 1-2 sentence paragraphs with concrete tradeoffs`;
    }

    const { styleFingerprint, samples } = profile;
    const sampleExcerpts = samples
      .map((s, idx) => `[Sample ${idx + 1} (${s.wordCount} words)]:\n"${s.text}"`)
      .join('\n\n');

    return `\n### Personalized Member Voice Profile for @${profile.handle}
- Average sentence length: ~${styleFingerprint.avgSentenceLength} words per sentence
- Target post length: ~${styleFingerprint.avgWordsPerPost} words
- Tone: ${styleFingerprint.vocabularyTone}
- Formatting: ${styleFingerprint.formattingStyle}
- Punctuation nuance: ${styleFingerprint.punctuationStyle}

Reference Writing Samples from this author (replicate cadence and vocabulary density, but NEVER violate anti-cringe filters):
${sampleExcerpts}`;
  }

  /**
   * Sets snooze duration in days. Proactive DMs are suppressed until expired.
   */
  static async snoozeMember(userId: string, days: number): Promise<string> {
    const profile = await this.getVoiceProfile(userId);
    const snoozeDate = new Date();
    snoozeDate.setDate(snoozeDate.getDate() + days);
    const snoozeIso = snoozeDate.toISOString();

    const updated: MemberVoiceProfile = profile
      ? { ...profile, snoozeUntil: snoozeIso, updatedAt: new Date().toISOString() }
      : {
          userId,
          handle: userId,
          samples: [],
          styleFingerprint: analyzeStyle([]),
          snoozeUntil: snoozeIso,
          optOut: false,
          updatedAt: new Date().toISOString(),
        };

    await setToStore(this.getKey(userId), updated);
    return snoozeIso;
  }

  /**
   * Opts out a member from proactive creator DMs.
   */
  static async optOutMember(userId: string): Promise<void> {
    const profile = await this.getVoiceProfile(userId);
    const updated: MemberVoiceProfile = profile
      ? { ...profile, optOut: true, updatedAt: new Date().toISOString() }
      : {
          userId,
          handle: userId,
          samples: [],
          styleFingerprint: analyzeStyle([]),
          snoozeUntil: null,
          optOut: true,
          updatedAt: new Date().toISOString(),
        };

    await setToStore(this.getKey(userId), updated);
  }

  /**
   * Re-enables a member who previously opted out.
   */
  static async optInMember(userId: string): Promise<void> {
    const profile = await this.getVoiceProfile(userId);
    if (profile) {
      profile.optOut = false;
      profile.snoozeUntil = null;
      profile.updatedAt = new Date().toISOString();
      await setToStore(this.getKey(userId), profile);
    }
  }

  /**
   * Checks if member is currently snoozed or opted out.
   */
  static async isMemberSnoozedOrOptedOut(userId: string): Promise<boolean> {
    const profile = await this.getVoiceProfile(userId);
    if (!profile) return false;
    if (profile.optOut) return true;
    if (profile.snoozeUntil) {
      return new Date(profile.snoozeUntil).getTime() > Date.now();
    }
    return false;
  }

  /**
   * Maintain a list of all registered member IDs for weekly impact reporting.
   */
  private static async registerActiveMember(userId: string): Promise<void> {
    const key = 'elg:members:active';
    const existing = (await getFromStore<string[]>(key)) || [];
    if (!existing.includes(userId)) {
      existing.push(userId);
      await setToStore(key, existing);
    }
  }

  static async getAllActiveMemberIds(): Promise<string[]> {
    const key = 'elg:members:active';
    return (await getFromStore<string[]>(key)) || [];
  }
}
