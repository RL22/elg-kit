import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);
const CLI_PATH = resolve(import.meta.dirname, '../bin/index.js');

test('CLI --help displays usage and options', async () => {
  const { stdout, stderr } = await execFileAsync('node', [CLI_PATH, '--help']);
  assert.equal(stderr, '');
  assert.match(stdout, /create-elg-kit/);
  assert.match(stdout, /USAGE:/);
  assert.match(stdout, /--edge-domain/);
  assert.match(stdout, /--provider/);
  assert.match(stdout, /--slack-bot-token/);
});

test('CLI --version displays correct version', async () => {
  const { stdout, stderr } = await execFileAsync('node', [CLI_PATH, '--version']);
  assert.equal(stderr, '');
  assert.match(stdout, /^v0\.1\.0/);
});

test('CLI --dry-run prints generated configs without writing files', async () => {
  const { stdout, stderr } = await execFileAsync('node', [
    CLI_PATH,
    '--dry-run',
    '--non-interactive',
    '--company=Sprintz',
    '--provider=openrouter',
    '--api-key=sk-or-v1-dryrun-key',
    '--edge-domain=go.sprintz.com',
    '--allowlist=sprintz.com,docs.sprintz.com',
    '--app-domain=elg.sprintz.com',
    '--slack-bot-token=xoxb-test-dryrun',
    '--slack-app-token=xapp-test-dryrun',
    '--slack-signing-secret=secret-dryrun',
  ]);

  assert.equal(stderr, '');
  assert.match(stdout, /\[DRY RUN MODE\]/);
  assert.match(stdout, /AI_PROVIDER=openrouter/);
  assert.match(stdout, /OPENROUTER_API_KEY=sk-or-v1-dryrun-key/);
  assert.match(stdout, /EDGE_REDIRECT_BASE_URL=go\.sprintz\.com/);
  assert.match(stdout, /"name": "Sprintz ELG"/);
  assert.match(stdout, /"display_name": "sprintz-elg"/);
  assert.match(stdout, /https:\/\/elg\.sprintz\.com\/api\/slack\/events/);
  assert.match(stdout, /Next Steps to Launch:/);
  assert.match(stdout, /pnpm install/);
  assert.match(stdout, /npx wrangler deploy/);
});

test('CLI writes valid .env and slack-manifest.json in target directory', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'create-elg-kit-test-'));
  try {
    const { stdout, stderr } = await execFileAsync('node', [
      CLI_PATH,
      '--non-interactive',
      `--dir=${tempDir}`,
      '--company=Acme Tech',
      '--provider=anthropic',
      '--api-key=sk-ant-testkey',
      '--edge-domain=go.acmetech.com',
      '--allowlist=acmetech.com,docs.acmetech.com',
      '--app-domain=elg.acmetech.com',
      '--slack-bot-token=xoxb-testbot',
      '--slack-app-token=xapp-testapp',
      '--slack-signing-secret=sec-test',
    ]);

    assert.equal(stderr, '');
    assert.match(stdout, /Created \.env/);
    assert.match(stdout, /Created slack-manifest\.json/);

    // Read and verify .env
    const envContent = await readFile(join(tempDir, '.env'), 'utf-8');
    assert.match(envContent, /AI_PROVIDER=anthropic/);
    assert.match(envContent, /AI_MODEL_ID=claude-3-7-sonnet-latest/);
    assert.match(envContent, /ANTHROPIC_API_KEY=sk-ant-testkey/);
    assert.match(envContent, /EDGE_REDIRECT_BASE_URL=go\.acmetech\.com/);
    assert.match(envContent, /SLACK_BOT_TOKEN=xoxb-testbot/);
    assert.match(envContent, /WEBHOOK_SECRET=[0-9a-f]{64}/);

    // Read and verify slack-manifest.json
    const manifestRaw = await readFile(join(tempDir, 'slack-manifest.json'), 'utf-8');
    const manifest = JSON.parse(manifestRaw);
    assert.equal(manifest.display_information.name, 'Acme Tech ELG');
    assert.equal(manifest.features.bot_user.display_name, 'acme-tech-elg');
    assert.equal(manifest.features.slash_commands[0].url, 'https://elg.acmetech.com/api/slack/events');
    assert.equal(manifest.settings.event_subscriptions.request_url, 'https://elg.acmetech.com/api/slack/events');
    assert.equal(manifest.settings.interactivity.request_url, 'https://elg.acmetech.com/api/slack/events');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
