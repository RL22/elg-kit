#!/usr/bin/env node

/**
 * @file packages/create-elg-kit/bin/index.js
 * @description Interactive setup wizard for elg-kit (Employee-Led Growth rails)
 * Authored by Rodney Lewis and Sprintz. Licensed under Apache-2.0.
 */

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { existsSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';

// ANSI terminal color utilities
const isColorSupported = !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR);
const c = {
  reset: isColorSupported ? '\x1b[0m' : '',
  bold: isColorSupported ? '\x1b[1m' : '',
  dim: isColorSupported ? '\x1b[2m' : '',
  italic: isColorSupported ? '\x1b[3m' : '',
  underline: isColorSupported ? '\x1b[4m' : '',
  red: isColorSupported ? '\x1b[31m' : '',
  green: isColorSupported ? '\x1b[32m' : '',
  yellow: isColorSupported ? '\x1b[33m' : '',
  blue: isColorSupported ? '\x1b[34m' : '',
  magenta: isColorSupported ? '\x1b[35m' : '',
  cyan: isColorSupported ? '\x1b[36m' : '',
  white: isColorSupported ? '\x1b[37m' : '',
  gray: isColorSupported ? '\x1b[90m' : '',
};

const VERSION = '0.1.0';

/**
 * Parse CLI arguments without external dependencies
 */
function parseArgs(args) {
  const options = {
    help: false,
    version: false,
    dryRun: false,
    nonInteractive: false,
    force: false,
    dir: '.',
    company: '',
    edgeDomain: '',
    allowlist: '',
    appDomain: '',
    provider: '',
    apiKey: '',
    ollamaUrl: '',
    slackBotToken: '',
    slackAppToken: '',
    slackSigningSecret: '',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--version' || arg === '-v') {
      options.version = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--non-interactive' || arg === '--yes' || arg === '-y') {
      options.nonInteractive = true;
    } else if (arg === '--force' || arg === '-f') {
      options.force = true;
    } else if (arg === '--dir') {
      options.dir = args[++i] || '.';
    } else if (arg.startsWith('--dir=')) {
      options.dir = arg.slice(6);
    } else if (arg === '--company') {
      options.company = args[++i] || '';
    } else if (arg.startsWith('--company=')) {
      options.company = arg.slice(10);
    } else if (arg === '--edge-domain') {
      options.edgeDomain = args[++i] || '';
    } else if (arg.startsWith('--edge-domain=')) {
      options.edgeDomain = arg.slice(14);
    } else if (arg === '--allowlist') {
      options.allowlist = args[++i] || '';
    } else if (arg.startsWith('--allowlist=')) {
      options.allowlist = arg.slice(12);
    } else if (arg === '--app-domain') {
      options.appDomain = args[++i] || '';
    } else if (arg.startsWith('--app-domain=')) {
      options.appDomain = arg.slice(13);
    } else if (arg === '--provider') {
      options.provider = args[++i] || '';
    } else if (arg.startsWith('--provider=')) {
      options.provider = arg.slice(11);
    } else if (arg === '--api-key') {
      options.apiKey = args[++i] || '';
    } else if (arg.startsWith('--api-key=')) {
      options.apiKey = arg.slice(10);
    } else if (arg === '--ollama-url') {
      options.ollamaUrl = args[++i] || '';
    } else if (arg.startsWith('--ollama-url=')) {
      options.ollamaUrl = arg.slice(13);
    } else if (arg === '--slack-bot-token') {
      options.slackBotToken = args[++i] || '';
    } else if (arg.startsWith('--slack-bot-token=')) {
      options.slackBotToken = arg.slice(18);
    } else if (arg === '--slack-app-token') {
      options.slackAppToken = args[++i] || '';
    } else if (arg.startsWith('--slack-app-token=')) {
      options.slackAppToken = arg.slice(18);
    } else if (arg === '--slack-signing-secret') {
      options.slackSigningSecret = args[++i] || '';
    } else if (arg.startsWith('--slack-signing-secret=')) {
      options.slackSigningSecret = arg.slice(23);
    } else if (!arg.startsWith('-') && options.dir === '.') {
      options.dir = arg;
    }
  }

  return options;
}

/**
 * Print help manual
 */
function printHelp() {
  console.log(`
${c.bold}${c.cyan}create-elg-kit${c.reset} ${c.gray}v${VERSION}${c.reset}
Interactive setup wizard for elg-kit (Employee-Led Growth rails).

${c.bold}USAGE:${c.reset}
  $ npx create-elg-kit [target-dir] [options]
  $ pnpm create elg-kit [target-dir] [options]

${c.bold}OPTIONS:${c.reset}
  ${c.green}-h, --help${c.reset}                 Show this help message and exit
  ${c.green}-v, --version${c.reset}              Show version number and exit
  ${c.green}--dry-run${c.reset}                  Preview configuration without writing any files
  ${c.green}-y, --yes, --non-interactive${c.reset}
                             Accept defaults / CLI values without interactive prompts
  ${c.green}-f, --force${c.reset}                Overwrite existing files without prompting
  ${c.green}--dir <path>${c.reset}               Directory to output configuration (default: .)
  ${c.green}--company <name>${c.reset}           Company / Organization name
  ${c.green}--edge-domain <domain>${c.reset}     Target edge redirect domain (e.g. go.company.com)
  ${c.green}--allowlist <domains>${c.reset}       Destination allowlist domains (comma-separated)
  ${c.green}--app-domain <domain>${c.reset}       Slack events app domain / tunnel host
  ${c.green}--provider <provider>${c.reset}       Inference provider: openrouter, anthropic, openai, ollama
  ${c.green}--api-key <key>${c.reset}             API key for chosen provider
  ${c.green}--ollama-url <url>${c.reset}          Base URL for Ollama (default: http://localhost:11434/v1)
  ${c.green}--slack-bot-token <token>${c.reset}   Slack Bot User OAuth Token (xoxb-...)
  ${c.green}--slack-app-token <token>${c.reset}   Slack App-Level Token (xapp-...)
  ${c.green}--slack-signing-secret <sec>${c.reset}
                             Slack Signing Secret

${c.bold}EXAMPLES:${c.reset}
  ${c.gray}# Interactive setup in current directory:${c.reset}
  $ npx create-elg-kit

  ${c.gray}# Dry run to test generated configs without writing:${c.reset}
  $ npx create-elg-kit --dry-run

  ${c.gray}# Non-interactive automated setup:${c.reset}
  $ npx create-elg-kit --non-interactive \\
      --company="Acme Corp" \\
      --edge-domain="go.acme.com" \\
      --allowlist="acme.com,docs.acme.com" \\
      --provider=openrouter \\
      --api-key="sk-or-v1-test-key"
`);
}

/**
 * Sanitize company name to standard url slug
 */
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'company';
}

/**
 * Clean domain input (strip protocol and paths)
 */
function cleanDomain(inputStr) {
  if (!inputStr) return '';
  return inputStr
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

/**
 * Prompt user for single text input with a default fallback
 */
async function promptInput(rl, label, defaultValue = '', hint = '') {
  const hintText = hint ? ` ${c.gray}(${hint})${c.reset}` : '';
  const defaultText = defaultValue ? ` ${c.dim}[default: ${defaultValue}]${c.reset}` : '';
  const promptStr = `${c.cyan}?${c.reset} ${c.bold}${label}${c.reset}${hintText}${defaultText}: `;
  
  const response = (await rl.question(promptStr)).trim();
  return response || defaultValue;
}

/**
 * Prompt user for numbered single choice
 */
async function promptChoice(rl, label, choices, defaultChoice = 1) {
  console.log(`\n${c.cyan}?${c.reset} ${c.bold}${label}${c.reset}`);
  choices.forEach((choice, idx) => {
    const num = idx + 1;
    const isDefault = num === defaultChoice;
    const tag = isDefault ? ` ${c.green}(Recommended)${c.reset}` : '';
    console.log(`  ${c.yellow}${num})${c.reset} ${choice.title}${tag}`);
    if (choice.subtitle) {
      console.log(`     ${c.gray}${choice.subtitle}${c.reset}`);
    }
  });

  while (true) {
    const promptStr = `${c.cyan}Select (1-${choices.length}) [default: ${defaultChoice}]:${c.reset} `;
    const response = (await rl.question(promptStr)).trim();
    if (!response) {
      return choices[defaultChoice - 1];
    }
    const parsed = parseInt(response, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= choices.length) {
      return choices[parsed - 1];
    }
    // Check if user entered the key name directly
    const matched = choices.find((ch) => ch.id.toLowerCase() === response.toLowerCase());
    if (matched) return matched;

    console.log(`${c.red}Please enter a valid number between 1 and ${choices.length}.${c.reset}`);
  }
}

/**
 * Main wizard execution logic
 */
async function run() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (options.version) {
    console.log(`v${VERSION}`);
    process.exit(0);
  }

  console.log(`
${c.cyan}┌──────────────────────────────────────────────────────────────┐
│${c.reset}  ${c.bold}${c.magenta}⚡ elg-kit setup wizard ⚡${c.reset}                                  ${c.cyan}│
│${c.reset}  ${c.dim}Developer-first rails for Employee-Led Growth (ELG)${c.reset}         ${c.cyan}│
└──────────────────────────────────────────────────────────────┘${c.reset}
`);

  const targetDir = resolve(process.cwd(), options.dir);
  console.log(`${c.gray}Target directory:${c.reset} ${c.bold}${targetDir}${c.reset}`);
  if (options.dryRun) {
    console.log(`${c.yellow}${c.bold}[DRY RUN MODE]${c.reset} No files will be written to disk.\n`);
  }

  // Determine interaction mode
  const isInteractive = !options.nonInteractive && process.stdin.isTTY;
  const rl = isInteractive ? createInterface({ input, output }) : null;

  try {
    // ------------------------------------------------------------------------
    // 1. Organization & Edge Domains
    // ------------------------------------------------------------------------
    console.log(`${c.bold}${c.blue}1. Organization & Edge Domains${c.reset}`);
    console.log(`${c.gray}Configure company identity and link attribution boundaries.${c.reset}`);

    let companyName = options.company;
    if (!companyName) {
      if (isInteractive) {
        companyName = await promptInput(rl, 'Company / Organization Name', 'Acme Corp');
      } else {
        companyName = 'Acme Corp';
      }
    }

    const companySlug = slugify(companyName);
    const defaultEdgeDomain = `go.${companySlug}.com`;
    const defaultAllowlist = `${companySlug}.com,docs.${companySlug}.com,blog.${companySlug}.com,github.com`;
    const defaultAppDomain = `elg.${companySlug}.com`;

    let edgeDomain = options.edgeDomain;
    if (!edgeDomain) {
      if (isInteractive) {
        edgeDomain = await promptInput(rl, 'Target edge redirect domain', defaultEdgeDomain, 'e.g. go.company.com');
      } else {
        edgeDomain = defaultEdgeDomain;
      }
    }
    edgeDomain = cleanDomain(edgeDomain);

    let allowlist = options.allowlist;
    if (!allowlist) {
      if (isInteractive) {
        allowlist = await promptInput(
          rl,
          'Target destination allowlist domains',
          defaultAllowlist,
          'comma-separated'
        );
      } else {
        allowlist = defaultAllowlist;
      }
    }

    let appDomain = options.appDomain;
    if (!appDomain) {
      if (isInteractive) {
        appDomain = await promptInput(
          rl,
          'Slack Webhook Host / App Domain',
          defaultAppDomain,
          'public host or tunnel for Slack events'
        );
      } else {
        appDomain = defaultAppDomain;
      }
    }
    appDomain = cleanDomain(appDomain);

    // ------------------------------------------------------------------------
    // 2. AI Inference Provider
    // ------------------------------------------------------------------------
    console.log(`\n${c.bold}${c.blue}2. Preferred AI Inference Provider${c.reset}`);
    console.log(`${c.gray}elg-kit is 100% provider-agnostic. Select your preferred engine.${c.reset}`);

    const providerChoices = [
      {
        id: 'openrouter',
        title: 'OpenRouter (Universal Gateway)',
        subtitle: 'Access Claude 3.7 Sonnet, Gemini 2.5 Pro, DeepSeek, and GPT-5 via single key',
        defaultModel: 'anthropic/claude-3.7-sonnet',
      },
      {
        id: 'anthropic',
        title: 'Anthropic (Direct API)',
        subtitle: 'Direct native Anthropic Claude 3.7 Sonnet',
        defaultModel: 'claude-3-7-sonnet-latest',
      },
      {
        id: 'openai',
        title: 'OpenAI (Direct API)',
        subtitle: 'Direct native OpenAI GPT-5.6 / o3-mini',
        defaultModel: 'gpt-5.6-sol',
      },
      {
        id: 'ollama',
        title: 'Local Ollama (Self-Hosted Private)',
        subtitle: '100% local open-weight inference (Qwen 2.5 32b, Llama 3.3 70b)',
        defaultModel: 'qwen2.5:32b',
      },
    ];

    let selectedProviderObj;
    if (options.provider) {
      const match = providerChoices.find(
        (p, idx) => p.id === options.provider.toLowerCase() || String(idx + 1) === options.provider
      );
      selectedProviderObj = match || providerChoices[0];
    } else if (isInteractive) {
      selectedProviderObj = await promptChoice(
        rl,
        'Select inference provider:',
        providerChoices,
        1
      );
    } else {
      selectedProviderObj = providerChoices[0];
    }

    const aiProvider = selectedProviderObj.id;
    const aiModelId = selectedProviderObj.defaultModel;

    // ------------------------------------------------------------------------
    // 3. Provider Credentials
    // ------------------------------------------------------------------------
    console.log(`\n${c.bold}${c.blue}3. Provider Credentials (${selectedProviderObj.title})${c.reset}`);

    let openrouterApiKey = '';
    let anthropicApiKey = '';
    let openaiApiKey = '';
    let ollamaBaseUrl = 'http://localhost:11434/v1';

    if (aiProvider === 'openrouter') {
      let key = options.apiKey;
      if (!key && isInteractive) {
        key = await promptInput(rl, 'OpenRouter API Key', '', 'sk-or-v1-..., or leave blank for template');
      }
      openrouterApiKey = key || 'sk-or-v1-...';
    } else if (aiProvider === 'anthropic') {
      let key = options.apiKey;
      if (!key && isInteractive) {
        key = await promptInput(rl, 'Anthropic API Key', '', 'sk-ant-..., or leave blank for template');
      }
      anthropicApiKey = key || 'sk-ant-...';
    } else if (aiProvider === 'openai') {
      let key = options.apiKey;
      if (!key && isInteractive) {
        key = await promptInput(rl, 'OpenAI API Key', '', 'sk-proj-..., or leave blank for template');
      }
      openaiApiKey = key || 'sk-proj-...';
    } else if (aiProvider === 'ollama') {
      let url = options.ollamaUrl;
      if (!url && isInteractive) {
        url = await promptInput(rl, 'Ollama Base URL', 'http://localhost:11434/v1');
      }
      ollamaBaseUrl = url || 'http://localhost:11434/v1';
    }

    // ------------------------------------------------------------------------
    // 4. Slack Integration Credentials
    // ------------------------------------------------------------------------
    console.log(`\n${c.bold}${c.blue}4. Slack Integration Credentials${c.reset}`);
    console.log(`${c.gray}Obtained from your Slack app settings at https://api.slack.com/apps${c.reset}`);

    let slackBotToken = options.slackBotToken;
    if (!slackBotToken) {
      if (isInteractive) {
        slackBotToken = await promptInput(
          rl,
          'Slack Bot Token',
          '',
          'xoxb-..., press Enter to fill later'
        );
      }
    }
    slackBotToken = slackBotToken || 'xoxb-...';

    let slackAppToken = options.slackAppToken;
    if (!slackAppToken) {
      if (isInteractive) {
        slackAppToken = await promptInput(
          rl,
          'Slack App Token',
          '',
          'xapp-..., press Enter to fill later'
        );
      }
    }
    slackAppToken = slackAppToken || 'xapp-...';

    let slackSigningSecret = options.slackSigningSecret;
    if (!slackSigningSecret) {
      if (isInteractive) {
        slackSigningSecret = await promptInput(
          rl,
          'Slack Signing Secret',
          '',
          'press Enter to fill later'
        );
      }
    }
    slackSigningSecret = slackSigningSecret || 'your_signing_secret_here';

    // Generate secure cryptographically random webhook secret
    const webhookSecret = randomBytes(32).toString('hex');

    // ------------------------------------------------------------------------
    // 5. Generate Customized Artifacts
    // ------------------------------------------------------------------------
    console.log(`\n${c.bold}${c.blue}5. Generating Customized Configuration${c.reset}`);

    const envContent = `# ==============================================================================
# elg-kit Environment Configuration
# Configured for: ${companyName}
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. AI Inference Layer (100% Provider-Agnostic)
# ------------------------------------------------------------------------------
AI_PROVIDER=${aiProvider}
AI_MODEL_ID=${aiModelId}

# Provider API Keys (Active: ${aiProvider.toUpperCase()})
OPENROUTER_API_KEY=${openrouterApiKey}
ANTHROPIC_API_KEY=${anthropicApiKey}
OPENAI_API_KEY=${openaiApiKey}
GROQ_API_KEY=
DEEPSEEK_API_KEY=
OLLAMA_BASE_URL=${ollamaBaseUrl}

# ------------------------------------------------------------------------------
# 2. Slack Integration Credentials
# ------------------------------------------------------------------------------
SLACK_BOT_TOKEN=${slackBotToken}
SLACK_APP_TOKEN=${slackAppToken}
SLACK_SIGNING_SECRET=${slackSigningSecret}
SLACK_STAGING_CHANNEL_ID=C0123456789
PORT=3000

# ------------------------------------------------------------------------------
# 3. Edge Redirect & Attribution Rails (Cloudflare Worker)
# ------------------------------------------------------------------------------
EDGE_REDIRECT_BASE_URL=${edgeDomain}
EDGE_REDIRECT_ALLOWLIST_DOMAINS=${allowlist}

# ------------------------------------------------------------------------------
# 4. Ingestion Webhook Signature
# ------------------------------------------------------------------------------
WEBHOOK_SECRET=${webhookSecret}

# ------------------------------------------------------------------------------
# 5. Storage / State (Vercel KV or Upstash Redis)
# ------------------------------------------------------------------------------
KV_REST_API_URL=https://...
KV_REST_API_TOKEN=...
`;

    const appDisplayName = companyName.length > 31 ? `${companyName.slice(0, 31)} ELG` : `${companyName} ELG`;
    const botDisplayName = `${companySlug.slice(0, 30)}-elg`;
    const eventUrl = `https://${appDomain}/api/slack/events`;

    const slackManifest = {
      _metadata: {
        major_version: 1,
        minor_version: 1,
      },
      display_information: {
        name: appDisplayName,
        description: `Employee-Led Growth for ${companyName}: authentic technical perspectives, peer reviews, and attribution.`,
        background_color: '#eb6c36',
        long_description: `Developer-first rails for Employee-Led Growth (ELG) at ${companyName}. Empowers technical teams to share engineering milestones authentically, bypass social algorithmic link penalties with comment-first edge attribution, request pre-publish peer reviews, and generate 1-click personal resharing shortlinks.`,
      },
      features: {
        bot_user: {
          display_name: botDisplayName,
          always_online: true,
        },
        slash_commands: [
          {
            command: '/link',
            url: eventUrl,
            description: 'Generate your personal attributed edge shortlink for any URL',
            usage_hint: '<destination-url>',
            should_escape: false,
          },
          {
            command: '/angles',
            url: eventUrl,
            description: 'Browse recent company milestone angles (Builder, GTM, Talent, Visionary, Product)',
            usage_hint: '[milestone-id]',
            should_escape: false,
          },
          {
            command: '/showcase',
            url: eventUrl,
            description: 'Share published post to #showcase with thread-only discussion rule',
            usage_hint: '<post-url> [reflection]',
            should_escape: false,
          },
          {
            command: '/elg',
            url: eventUrl,
            description: 'Manage ELG voice samples, weekly impact stats, and snooze preferences',
            usage_hint: 'sample | stats | snooze | opt-out',
            should_escape: false,
          },
        ],
      },
      oauth_config: {
        scopes: {
          bot: [
            'chat:write',
            'chat:write.public',
            'commands',
            'channels:history',
            'groups:history',
            'im:history',
            'im:write',
            'im:read',
            'users:read',
            'users:read.email',
            'reactions:write',
          ],
        },
      },
      settings: {
        event_subscriptions: {
          request_url: eventUrl,
          bot_events: [
            'app_mention',
            'message.im',
            'message.channels',
            'reaction_added',
          ],
        },
        interactivity: {
          is_enabled: true,
          request_url: eventUrl,
        },
        org_deploy_enabled: false,
        socket_mode_enabled: false,
        token_rotation_enabled: false,
      },
    };

    const manifestContent = JSON.stringify(slackManifest, null, 2) + '\n';

    const envFilePath = join(targetDir, '.env');
    const manifestFilePath = join(targetDir, 'slack-manifest.json');

    if (options.dryRun) {
      console.log(`\n${c.bold}${c.yellow}--- [DRY RUN] Generated .env: ---${c.reset}`);
      console.log(envContent);
      console.log(`${c.bold}${c.yellow}--- [DRY RUN] Generated slack-manifest.json: ---${c.reset}`);
      console.log(manifestContent);
    } else {
      if (!existsSync(targetDir)) {
        await mkdir(targetDir, { recursive: true });
      }

      // Check existing files
      if (existsSync(envFilePath) && !options.force && isInteractive) {
        const overwrite = await promptInput(rl, `File .env already exists. Overwrite? (y/N)`, 'n');
        if (overwrite.toLowerCase().startsWith('y')) {
          await writeFile(envFilePath, envContent, 'utf-8');
          console.log(`  ${c.green}✔${c.reset} Overwrote ${c.bold}.env${c.reset}`);
        } else {
          console.log(`  ${c.yellow}⚠${c.reset} Skipped writing ${c.bold}.env${c.reset}`);
        }
      } else {
        await writeFile(envFilePath, envContent, 'utf-8');
        console.log(`  ${c.green}✔${c.reset} Created ${c.bold}.env${c.reset}`);
      }

      if (existsSync(manifestFilePath) && !options.force && isInteractive) {
        const overwrite = await promptInput(rl, `File slack-manifest.json already exists. Overwrite? (y/N)`, 'n');
        if (overwrite.toLowerCase().startsWith('y')) {
          await writeFile(manifestFilePath, manifestContent, 'utf-8');
          console.log(`  ${c.green}✔${c.reset} Overwrote ${c.bold}slack-manifest.json${c.reset}`);
        } else {
          console.log(`  ${c.yellow}⚠${c.reset} Skipped writing ${c.bold}slack-manifest.json${c.reset}`);
        }
      } else {
        await writeFile(manifestFilePath, manifestContent, 'utf-8');
        console.log(`  ${c.green}✔${c.reset} Created ${c.bold}slack-manifest.json${c.reset}`);
      }
    }

    // ------------------------------------------------------------------------
    // 6. Display Next Steps
    // ------------------------------------------------------------------------
    console.log(`
${c.green}┌──────────────────────────────────────────────────────────────┐
│${c.reset}  ${c.bold}${c.green}🎉 elg-kit setup wizard completed successfully!${c.reset}             ${c.cyan}│
└──────────────────────────────────────────────────────────────┘${c.reset}

${c.bold}${c.white}════════════════════════════════════════════════════════════════${c.reset}
  ${c.bold}Next Steps to Launch:${c.reset}
${c.bold}${c.white}════════════════════════════════════════════════════════════════${c.reset}

${c.bold}1. Install Monorepo Dependencies:${c.reset}
   $ ${c.cyan}pnpm install${c.reset}

${c.bold}2. Import Slack App Manifest:${c.reset}
   a. Open ${c.underline}https://api.slack.com/apps?new_app=1${c.reset}
   b. Select ${c.bold}"From an app manifest"${c.reset}
   c. Choose your workspace
   d. Paste the contents of ${c.bold}slack-manifest.json${c.reset}
   e. Navigate to ${c.bold}"Install App"${c.reset} and click ${c.bold}"Install to Workspace"${c.reset}
   f. Verify or add any missing tokens into ${c.bold}.env${c.reset}

${c.bold}3. Deploy the Edge Redirect Cloudflare Worker:${c.reset}
   $ ${c.cyan}cd packages/edge-redirect && npx wrangler deploy${c.reset}
   ${c.gray}Configure DNS for ${c.white}${edgeDomain}${c.gray} in Cloudflare to route to your worker.${c.reset}

${c.bold}4. Run the Local Development Agent:${c.reset}
   $ ${c.cyan}pnpm dev${c.reset}
`);
  } finally {
    if (rl) {
      rl.close();
    }
  }
}

run().catch((err) => {
  console.error(`\n${c.red}${c.bold}Error:${c.reset} ${err.message}`);
  process.exit(1);
});
