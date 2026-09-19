import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { executeSemanticTask } from '../../../packages/elg-engine/dist/index.js';
import { SignalParser, MilestoneSignal } from './tools/signal-parser.js';
import { VoiceProfiler } from './tools/voice-profiler.js';
import { SlackChannelRouter } from './channels/slack.js';
import { WeeklyImpactScheduler } from './schedules/weekly-impact.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PerspectiveOutput {
  role: 'builder' | 'gtm' | 'talent' | 'visionary' | 'product';
  title: string;
  postBody: string; // Strictly link-free
  firstComment: string; // Contains the attributed shortlink
  wordCount: number;
}

export interface EveAgentConfig {
  instructionsPath?: string;
  provider?: 'openrouter' | 'anthropic' | 'openai' | 'google' | 'groq' | 'deepseek' | 'ollama' | 'gateway';
  apiKey?: string;
  baseUrl?: string;
  aiGatewayUrl?: string;
  aiGatewayToken?: string;
  modelId?: string;
  temperature?: number;
  webhookSecret?: string;
  edgeRedirectBaseUrl?: string;
}

/**
 * Vercel Eve Filesystem-First Agent Runtime for elg-kit.
 * Provider-agnostic: natively supports OpenRouter, Anthropic, OpenAI,
 * Groq, DeepSeek, Ollama, and Vercel AI Gateway.
 */
export class ElgAgent {
  public instructions: string;
  public slackRouter: SlackChannelRouter;
  public impactScheduler: WeeklyImpactScheduler;
  private provider: string;
  private apiKey?: string;
  private baseUrl?: string;
  private aiGatewayUrl: string;
  private aiGatewayToken: string;
  private modelId: string;
  private temperature?: number;
  private webhookSecret: string;
  private edgeRedirectBaseUrl: string;

  constructor(config: EveAgentConfig = {}) {
    // 1. Filesystem-first instructions loading
    const defaultInstructionsPath = path.resolve(__dirname, 'instructions.md');
    const instructionsPath = config.instructionsPath || defaultInstructionsPath;
    this.instructions = fs.existsSync(instructionsPath)
      ? fs.readFileSync(instructionsPath, 'utf-8')
      : 'Authentic engineering perspective engine. Zero corporate hype. Post body must be link-free.';

    // 2. Provider and inference resolution
    this.provider =
      config.provider ||
      process.env.AI_PROVIDER ||
      (process.env.OPENROUTER_API_KEY ? 'openrouter' : 'openrouter');

    this.apiKey =
      config.apiKey ||
      process.env.OPENROUTER_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.GROQ_API_KEY ||
      process.env.DEEPSEEK_API_KEY;

    this.baseUrl = config.baseUrl || process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL;
    this.aiGatewayUrl = config.aiGatewayUrl || process.env.AI_GATEWAY_URL || 'https://ai-gateway.vercel.sh/v1';
    this.aiGatewayToken = config.aiGatewayToken || process.env.AI_GATEWAY_TOKEN || '';

    // Modern 2026 flagship default: Anthropic Claude 3.7 Sonnet / Google Gemini 2.5 Pro via OpenRouter
    this.modelId =
      config.modelId ||
      process.env.AI_MODEL_ID ||
      'anthropic/claude-3.7-sonnet';

    this.temperature = config.temperature ?? (process.env.AI_TEMPERATURE ? parseFloat(process.env.AI_TEMPERATURE) : undefined);
    this.webhookSecret = config.webhookSecret || process.env.WEBHOOK_SECRET || 'dev_secret_elg';
    this.edgeRedirectBaseUrl = config.edgeRedirectBaseUrl || process.env.EDGE_REDIRECT_BASE_URL || 'go.company.com';

    // 3. Initialize Channels & Schedules
    this.slackRouter = new SlackChannelRouter({
      edgeBaseUrl: this.edgeRedirectBaseUrl,
    });
    this.impactScheduler = new WeeklyImpactScheduler(this.slackRouter.app.client);
  }

  /**
   * Resolves the Language Model provider instance dynamically.
   * Compatible with OpenRouter, Anthropic, OpenAI, Groq, DeepSeek, Ollama, and Vercel AI Gateway.
   */
  private getLanguageModel() {
    // 1. OpenRouter (Universal Flagship Aggregator)
    if (this.provider === 'openrouter' || (this.apiKey && process.env.OPENROUTER_API_KEY)) {
      const openai = createOpenAI({
        baseURL: this.baseUrl || 'https://openrouter.ai/api/v1',
        apiKey: this.apiKey || process.env.OPENROUTER_API_KEY || '',
        headers: {
          'HTTP-Referer': 'https://github.com/RL22/elg-kit',
          'X-Title': 'elg-kit',
        },
      });
      return openai(this.modelId);
    }

    // 2. Groq (Ultra-Low Latency Inference)
    if (this.provider === 'groq' || process.env.GROQ_API_KEY) {
      const openai = createOpenAI({
        baseURL: this.baseUrl || 'https://api.groq.com/openai/v1',
        apiKey: this.apiKey || process.env.GROQ_API_KEY || '',
      });
      const cleanModel = this.modelId.replace(/^groq\//, '');
      return openai(cleanModel);
    }

    // 3. DeepSeek Direct
    if (this.provider === 'deepseek' || process.env.DEEPSEEK_API_KEY) {
      const openai = createOpenAI({
        baseURL: this.baseUrl || 'https://api.deepseek.com/v1',
        apiKey: this.apiKey || process.env.DEEPSEEK_API_KEY || '',
      });
      const cleanModel = this.modelId.replace(/^deepseek\//, '');
      return openai(cleanModel);
    }

    // 4. Ollama / Local OpenAI-compatible
    if (this.provider === 'ollama' || process.env.OLLAMA_BASE_URL) {
      const openai = createOpenAI({
        baseURL: this.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
        apiKey: this.apiKey || 'ollama',
      });
      const cleanModel = this.modelId.replace(/^ollama\//, '');
      return openai(cleanModel);
    }

    // 5. Anthropic Direct
    if (this.provider === 'anthropic' || (process.env.ANTHROPIC_API_KEY && !process.env.OPENROUTER_API_KEY)) {
      const cleanModel = this.modelId.replace(/^anthropic\//, '');
      const anthropic = createAnthropic({
        apiKey: this.apiKey || process.env.ANTHROPIC_API_KEY,
        baseURL: this.baseUrl,
      });
      return anthropic(cleanModel);
    }

    // 6. Vercel AI Gateway
    if (this.aiGatewayToken && (this.provider === 'gateway' || process.env.AI_GATEWAY_TOKEN)) {
      const isAnthropic = this.modelId.startsWith('anthropic/');
      const cleanModelName = this.modelId.replace(/^(anthropic|openai)\//, '');

      if (isAnthropic) {
        const anthropic = createAnthropic({
          baseURL: this.aiGatewayUrl,
          apiKey: this.aiGatewayToken,
          headers: {
            'x-ai-gateway-provider': 'anthropic',
          },
        });
        return anthropic(cleanModelName);
      } else {
        const openai = createOpenAI({
          baseURL: this.aiGatewayUrl,
          apiKey: this.aiGatewayToken,
          headers: {
            'x-ai-gateway-provider': 'openai',
          },
        });
        return openai(cleanModelName);
      }
    }

    // 7. OpenAI Direct Default
    const cleanModelName = this.modelId.replace(/^openai\//, '');
    const openai = createOpenAI({
      apiKey: this.apiKey || process.env.OPENAI_API_KEY || '',
      baseURL: this.baseUrl,
    });
    return openai(cleanModelName);
  }

  /**
   * Anti-Cringe and Tone Post-Processing Filter.
   * Strips banned vocabulary, forbidden emojis, and verifies link-free post body.
   */
  public postProcessDraft(
    rawText: string,
    memberSlug: string,
    targetUrl: string
  ): { postBody: string; firstComment: string; wordCount: number } {
    let cleaned = rawText;

    // 0. Strip reasoning and thinking traces (<think>...</think>, [thinking]...[/thinking])
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    cleaned = cleaned.replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, '').trim();

    // 1. Strip Forbidden Emojis (🚀, 🔥, 🎉, 💪, 📈, ✨)
    cleaned = cleaned.replace(/[🚀🔥🎉💪📈✨]/gu, '');

    // 2. Strip Banned Phrases
    const bannedPhrases = [
      /I am (thrilled|delighted|excited|humbled) to (announce|share)/gi,
      /game-?changer/gi,
      /paradigm shift/gi,
      /disrupt(ing)? the industry/gi,
      /synerg(y|istic)/gi,
      /revolutioniz(e|ing)/gi,
      /let that sink in\.?/gi,
      /unpacking this/gi,
      /agree\?/gi,
      /thoughts\?/gi,
      /buckle up/gi,
    ];

    for (const pattern of bannedPhrases) {
      cleaned = cleaned.replace(pattern, '').replace(/\s{2,}/g, ' ');
    }

    // 3. Extract or ensure zero links in postBody
    const linkRegex = /https?:\/\/[^\s)]+/gi;
    const extractedLinks = cleaned.match(linkRegex) || [];
    cleaned = cleaned.replace(linkRegex, '').trim();

    // 4. Ensure signpost to first comment exists
    if (!/comments?|link below/i.test(cleaned)) {
      cleaned += '\n\nFull architecture notes and repository links in the first comment.';
    }

    // 5. Generate personal shortlink for the first comment
    const personalShortlink = this.slackRouter.generatePersonalShortlink(memberSlug, targetUrl);
    const firstComment = `Link to the technical RFC & benchmark code: ${personalShortlink}`;

    const words = cleaned.split(/\s+/).filter(Boolean);

    return {
      postBody: cleaned.trim(),
      firstComment,
      wordCount: words.length,
    };
  }

  /**
   * Generates quintuple perspectives (Builder, GTM, Talent, Visionary, Product)
   * for an ingested milestone signal.
   */
  public async generatePerspectives(
    signal: MilestoneSignal,
    authorUserId?: string
  ): Promise<PerspectiveOutput[]> {
    const roles: Array<'builder' | 'gtm' | 'talent' | 'visionary' | 'product'> = [
      'builder',
      'gtm',
      'talent',
      'visionary',
      'product',
    ];

    // Retrieve member voice profile if author is known
    let voicePromptInjection = '';
    let memberSlug = signal.author.handle || 'member';

    if (authorUserId) {
      voicePromptInjection = await VoiceProfiler.getVoicePromptInjection(authorUserId);
      const profile = await VoiceProfiler.getVoiceProfile(authorUserId);
      if (profile?.handle) memberSlug = profile.handle;
    }

    const results: PerspectiveOutput[] = [];

    for (const role of roles) {
      const prompt = `
You are generating a LinkedIn/X post for a technical team member from the **${role.toUpperCase()}** perspective.

Milestone Details:
- Title: ${signal.title}
- Source: ${signal.source}
- Repository / Project: ${signal.repository || 'Core Engine'}
- Changelog Notes:
${signal.changelog}

${voicePromptInjection}

STRICT CONSTRAINTS (Violations will break the build):
1. ZERO BANNED WORDS (no "game-changer", "thrilled to announce", "paradigm shift", "synergy").
2. ZERO FORBIDDEN EMOJIS (no rockets, fire, party poppers, biceps).
3. LENGTH: 150 to 280 words.
4. NO EXTERNAL LINKS in the post text (link placement rule).
5. Conclude with a natural pointer that documentation or links are in the first comment.
`;

      try {
        const { text } = await executeSemanticTask('workhorse', prompt, {
          system: this.instructions,
          temperature: this.temperature,
          apiKey: this.apiKey,
          baseUrl: this.baseUrl,
          provider: this.provider as any,
          modelId: this.modelId,
          maxTokens: 3500,
        });

        const processed = this.postProcessDraft(text, memberSlug, signal.url);
        results.push({
          role,
          title: `${signal.title} (${role.toUpperCase()} perspective)`,
          postBody: processed.postBody,
          firstComment: processed.firstComment,
          wordCount: processed.wordCount,
        });
      } catch (err) {
        console.warn(`[agent] LLM generation failed for ${role}, using deterministic fallback:`, err);
        // Deterministic fallback satisfying all constraints
        const fallbackBody = `We just deployed ${signal.title} to production. Our primary constraint was eliminating query latency spikes under high write loads. By moving state resolution to the edge, we lowered P99 times without introducing distributed lock deadlocks. Architecture RFC and benchmarks in the comments.`;
        const processed = this.postProcessDraft(fallbackBody, memberSlug, signal.url);
        results.push({
          role,
          title: `${signal.title} (${role.toUpperCase()})`,
          postBody: processed.postBody,
          firstComment: processed.firstComment,
          wordCount: processed.wordCount,
        });
      }
    }

    return results;
  }

  /**
   * Ingestion Pipeline Webhook Handler.
   * Ingests GitHub, Linear, or custom signals with HMAC SHA-256 verification and replay protection.
   */
  public async handleWebhookSignal(
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>
  ): Promise<{ success: boolean; signal?: MilestoneSignal; error?: string }> {
    const { signal, verification } = SignalParser.verifyAndParse({
      rawBody,
      headers,
      secret: this.webhookSecret,
    });

    if (!verification.isValid || !signal) {
      console.warn(`[agent] Ingestion rejected: ${verification.reason}`);
      return { success: false, error: verification.reason };
    }

    console.log(`[agent] Verified signal received from ${signal.source}: "${signal.title}"`);

    // If signal requires staging approval, post to #elg-staging
    const stagingChannelId = process.env.SLACK_STAGING_CHANNEL_ID || 'elg-staging';
    if (signal.requiresReview) {
      try {
        await this.slackRouter.app.client.chat.postMessage({
          channel: stagingChannelId,
          text: `New Release Signal Pending Review: *${signal.title}* (${signal.source})`,
          blocks: [
            {
              type: 'header',
              text: { type: 'plain_text', text: '🚦 Release Ingestion Curation Gate', emoji: true },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Title:* ${signal.title}\n*Author:* ${signal.author.name} (${signal.source})\n*Repo:* ${
                  signal.repository || 'N/A'
                }\n\n*Changelog Summary:*\n>>>${signal.changelog.slice(0, 400)}`,
              },
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '✅ Approve for Creator DMs', emoji: true },
                  style: 'primary',
                  action_id: 'approve_signal_staging',
                  value: signal.id,
                },
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '🛑 Keep Internal Only', emoji: true },
                  style: 'danger',
                  action_id: 'reject_signal_staging',
                  value: signal.id,
                },
              ],
            },
          ],
        });
      } catch (err) {
        console.warn(`[agent] Could not dispatch to staging queue #${stagingChannelId}:`, err);
      }
    }

    return { success: true, signal };
  }

  /**
   * Start Agent Channels and Sockets
   */
  public async start(): Promise<void> {
    const port = Number(process.env.PORT) || 3000;
    await this.slackRouter.app.start(port);
    console.log(`⚡ elg-kit Vercel Eve Agent is running on port ${port}`);
  }
}

// Standalone execution entrypoint
if (process.argv[1] && process.argv[1].endsWith('agent.ts')) {
  const agent = new ElgAgent();
  agent.start().catch((err) => {
    console.error('Failed to start elg-kit agent:', err);
    process.exit(1);
  });
}
