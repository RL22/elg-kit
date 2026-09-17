import type { App } from '@slack/bolt';
import { compileRetrospectiveBody } from './retrospective.js';

export function registerReboundHandler(app: App, edgeBaseUrl: string): void {
  app.command('/rebound', async ({ command, ack, respond }) => {
    await ack();

    const input = command.text?.trim() || '';
    if (!input) {
      await respond({
        text: '⚠️ Usage: `/rebound [release-name] --days [90|180]`',
        response_type: 'ephemeral'
      });
      return;
    }

    const postBody = compileRetrospectiveBody({
      releaseName: input.replace(/--days\s+\d+/i, '').trim(),
      daysInProduction: 180,
      originalThesis: 'moving state to distributed SQLite at the edge would slash p99 read latency under 10ms',
      metricsDelta: 'p99 latency dropped by 74% and stayed stable under 50k concurrent req/s',
      unexpectedEdgeCases: 'replication drift during cross-region network partitions',
      architecturalTakeaway: 'explicit failover beats implicit distributed consensus every single time'
    });

    const firstComment = `Deep dive on the benchmarks and edge architecture: ${edgeBaseUrl}/e/${command.user_name}?topic=retrospective`;

    await respond({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🔄 *90/180-Day Production Retrospective Draft:*\n\n${postBody}`
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
