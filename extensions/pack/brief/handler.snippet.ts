import type { App } from '@slack/bolt';
import { compileBriefBody } from './briefer.js';

export function registerBriefHandler(app: App, edgeBaseUrl: string): void {
  app.command('/brief', async ({ command, ack, respond }) => {
    await ack();

    const period = command.text?.trim() || 'Q3 2026';
    const postBody = compileBriefBody({
      period,
      shippedCount: 14,
      topWins: [
        'Migrated edge routing to zero-dependency Cloudflare Workers',
        'Implemented universal 2-wire model router with automatic 429 failover',
        'Cut p99 global redirect latency to under 8ms across 280 PoPs'
      ],
      kpiMetrics: {
        latencyDelta: 'improved by 48%',
        infrastructureCostDelta: 'decreased by 34%',
        uptime: '99.992%'
      }
    });

    const firstComment = `Executive technical roadmap and operational scorecard: ${edgeBaseUrl}/e/${command.user_name}?view=exec-brief`;

    await respond({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📊 *Executive Milestone Brief (${period}):*\n\n${postBody}`
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
