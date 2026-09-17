import type { App } from '@slack/bolt';
import { compileFaqBody } from './synthesizer.js';

export function registerAmaHandler(app: App, edgeBaseUrl: string): void {
  app.command('/ama', async ({ command, ack, respond }) => {
    await ack();

    const text = command.text?.trim() || '';
    if (!text) {
      await respond({
        text: '⚠️ Usage: `/ama [question or thread timestamp]`',
        response_type: 'ephemeral'
      });
      return;
    }

    const postBody = compileFaqBody({
      question: text.includes('?') ? text : `${text}?`,
      answeredBy: `@${command.user_name}`,
      technicalSummary: 'We chose in-memory zero-copy streams over traditional intermediate queues because serializing JSON across process boundaries accounted for 42% of our CPU time.'
    });

    const firstComment = `Architecture deep dive and benchmarks: ${edgeBaseUrl}/e/${command.user_name}?topic=faq`;

    await respond({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `❓ *Engineering FAQ Synthesis Draft:*\n\n${postBody}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*First Comment:*\n>${firstComment}`
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
