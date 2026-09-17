#!/usr/bin/env node
/**
 * @file compile-manifest.js
 * Generates an updated Slack Manifest JSON integrating Core 5 and Extension Pack slash commands.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const rootManifestPath = join(process.cwd(), 'slack-manifest.json');
let manifest = {};
try {
  manifest = JSON.parse(readFileSync(rootManifestPath, 'utf8'));
} catch (e) {
  manifest = {
    display_information: { name: 'ELG Bot' },
    features: { slash_commands: [], bot_user: { display_name: 'ELG Bot' } }
  };
}

const EXTENSION_COMMANDS = [
  {
    command: '/harvest',
    description: 'Harvest authentic technical insights from thread replies',
    usage_hint: '[thread_ts_or_url]'
  },
  {
    command: '/guard',
    description: 'Run pre-publish DLP inspection to detect API keys and internal IPs',
    usage_hint: '[text to inspect]'
  },
  {
    command: '/suggest',
    description: 'Mine recent Slack conversations for high-signal technical posts',
    usage_hint: ''
  },
  {
    command: '/impact',
    description: 'View private verified reads, bot-filtered clicks, and pipeline attribution',
    usage_hint: '[7 | 30 | 90]'
  },
  {
    command: '/repost',
    description: 'Adapt a technical milestone to GTM, Talent, or Product perspective',
    usage_hint: '[quote_or_url] --role [gtm|talent|product]'
  },
  {
    command: '/rebound',
    description: 'Generate a 90/180-day production retrospective post',
    usage_hint: '[release-name] --days [90|180]'
  },
  {
    command: '/kudos',
    description: 'Transform peer technical craft praise into an authentic spotlight',
    usage_hint: '@colleague [technical context]'
  },
  {
    command: '/ama',
    description: 'Synthesize architecture Q&A discussions into an engineering FAQ post',
    usage_hint: '[question or thread_ts]'
  },
  {
    command: '/brief',
    description: 'Compile an executive milestone digest memo for boards and investors',
    usage_hint: '[period, e.g. Q3 2026]'
  }
];

if (!manifest.features) manifest.features = {};
if (!manifest.features.slash_commands) manifest.features.slash_commands = [];

const existingCmds = new Set(manifest.features.slash_commands.map(c => c.command));
for (const ext of EXTENSION_COMMANDS) {
  if (!existingCmds.has(ext.command)) {
    manifest.features.slash_commands.push({
      command: ext.command,
      description: ext.description,
      usage_hint: ext.usage_hint,
      should_escape: false
    });
  }
}

console.log('✅ Compiled manifest with %d slash commands.', manifest.features.slash_commands.length);
