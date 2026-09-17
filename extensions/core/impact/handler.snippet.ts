import type { App } from '@slack/bolt';
import { calculateImpactReport } from './calculator.js';

export function registerImpactHandler(app: App): void {
  app.command('/impact', async ({ command, ack, respond }) => {
    await ack();

    const daysArg = parseInt(command.text?.trim() || '30', 10);
    const timeframeDays = (daysArg === 7 || daysArg === 90) ? daysArg : 30;
    const memberSlug = command.user_name || 'member';

    // In production, query Cloudflare Analytics Engine / D1 for memberSlug
    // Here we run deterministic calculation on mock or fetched metrics
    const report = calculateImpactReport({
      memberSlug,
      timeframeDays,
      totalRawClicks: 420,
      humanClicks: 280,
      referrers: [
        { source: 'LinkedIn', count: 180 },
        { source: 'X / Twitter', count: 70 },
        { source: 'Hacker News', count: 25 },
        { source: 'Direct', count: 5 }
      ]
    });

    await respond({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `📈 Personal Impact Report (${timeframeDays} Days)` }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Verified Reads:*\n✨ *${report.verifiedReads.toLocaleString()}* eng readers` },
            { type: 'mrkdwn', text: `*Read-Through Rate:*\n🎯 *${(report.readThroughRate * 100).toFixed(1)}%*` },
            { type: 'mrkdwn', text: `*Human Visitors:*\n👤 *${report.humanClicks}* (${report.botClicksFiltered} bots filtered)` },
            { type: 'mrkdwn', text: `*Est. Pipeline Value:*\n💼 *\$${report.estimatedPipelineValue.toLocaleString()}*` }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Top Inbound Referrers:*\n` + report.topReferrers.map(r => `• *${r.source}*: ${r.count} clicks (${r.percentage}%)`).join('\n')
          }
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: '🔒 _This impact report is private to you. Your edge shortlinks automatically credit your advocacy._' }
          ]
        }
      ]
    });
  });
}
