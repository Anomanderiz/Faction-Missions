import { env } from '@/lib/env';
import type { Poll } from '@/lib/types';

async function sendDiscord(content: string) {
  if (!env.discordWebhookUrl) return;

  await fetch(env.discordWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
}

export async function announcePollOpened(poll: Poll) {
  const options = poll.tallies
    .map((tally, index) => `${index + 1}. **${tally.title}** (${tally.type})`)
    .join('\n');

  await sendDiscord([
    '📜 **A new storyline vote has begun.**',
    '',
    options,
    '',
    `The poll closes automatically after **${poll.max_votes} votes**.`
  ].join('\n'));
}

export async function announcePollClosed(poll: Poll) {
  const winner = poll.tallies.find((tally) => tally.story_arc_id === poll.winner_story_arc_id) ?? poll.tallies[0];
  const breakdown = poll.tallies
    .map((tally) => `• **${tally.title}** — ${tally.vote_count} vote(s)${tally.voters.length ? ` [${tally.voters.join(', ')}]` : ''}`)
    .join('\n');

  await sendDiscord([
    '🏁 **The storyline vote is closed.**',
    '',
    winner ? `Winner: **${winner.title}** (${winner.type}) with **${winner.vote_count}** vote(s).` : 'No valid winner could be determined.',
    '',
    breakdown
  ].join('\n'));
}
