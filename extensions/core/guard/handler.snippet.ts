import type { App, SlashCommand } from '@slack/bolt';
import { scanDlp } from './scanner.js';

/**
 * Registers /guard slash command and pre-publish interceptor.
 */
export function registerGuardHandler(app: App): void {
  app.command('/guard', async ({ command, ack, respond }) => {
    await ack();

    const targetText = command.text?.trim() || '';
    if (!targetText) {
      await respond({
        text: '⚠️ Usage: `/guard [text to inspect]` or run as an interceptor before posting.',
        response_type: 'ephemeral'
      });
      return;
    }

    const result = scanDlp(targetText);

    if (result.clean) {
      await respond({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '🛡️ *DLP Inspection Passed*\nZero exposed credentials, API keys, private tokens, or internal hostnames detected.'
            }
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: `Risk Score: *0/100* | Safe for external sharing.` }
            ]
          }
        ]
      });
    } else {
      const findingsList = result.findings
        .map(f => `• *[${f.severity.toUpperCase()}]* \`${f.ruleId}\`: redacted as \`${f.redactedReplacement}\``)
        .join('\n');

      await respond({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🚨 *DLP Vulnerability Alert: Risk Score ${result.riskScore}/100*\n${result.findings.length} secret(s) or sensitive reference(s) detected:`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: findingsList
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Safe Redacted Preview:*\n>${result.sanitizedText.replace(/\n/g, '\n>')}`
            }
          }
        ]
      });
    }
  });
}
