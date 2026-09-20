import type { App } from '@slack/bolt';
import { boundAdaptedBody, formatDualAttribution } from './adapter.js';
import { executeSemanticTask } from '../../packages/elg-engine/src/router.js';

export function registerRepostHandler(app: App, edgeBaseUrl: string): void {
  app.command('/repost', async ({ command, ack, respond }) => {
    await ack();

    const text = command.text?.trim() || '';
    if (!text) {
      await respond({
        text: '⚠️ Usage: `/repost [quote or thread link] --role [gtm|talent|product]`',
        response_type: 'ephemeral'
      });
      return;
    }

    // Extract role flag
    let targetRole = 'gtm';
    if (/--role\s+(talent|product|gtm)/i.test(text)) {
      const match = text.match(/--role\s+(talent|product|gtm)/i);
      if (match) targetRole = match[1].toLowerCase();
    }

    const cleanInput = text.replace(/--role\s+[a-z]+/gi, '').trim();

    // Call Tier 2 Workhorse model for role perspective adaptation
    const prompt = `Adapt the following technical post into the "${targetRole}" perspective. Ensure tone is authentic and grounded. Aim for 150 to 300 words and do not pad with generic filler; use only facts present in the post. No buzzwords, no emojis, no links:\n\n"${cleanInput}"`;
    const adaptedRes = await executeSemanticTask('workhorse', prompt);
    const postBody = boundAdaptedBody(adaptedRes.text, targetRole);
    const firstComment = formatDualAttribution('engineer', `${edgeBaseUrl}/e/${command.user_name}?role=${targetRole}`, targetRole);

    await respond({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🔄 *Adapted for ${targetRole.toUpperCase()} Lens:*\n\n${postBody}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Dual Attribution (First Comment):*\n>${firstComment}`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '📢 Share to #showcase' },
              style: 'primary',
              action_id: 'action_share_to_showcase',
              value: JSON.stringify({ postBody, firstComment, authorId: command.user_id })
            }
          ]
        }
      ]
    });
  });
}
