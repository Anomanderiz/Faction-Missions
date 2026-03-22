import { z } from 'zod';
import { announcePollClosed } from '@/lib/discord';
import { fail, ok } from '@/lib/http';
import { getPublicState } from '@/lib/public-data';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getAllPolls } from '@/lib/polls';

const voteSchema = z.object({
  pollId: z.string().uuid(),
  storyArcId: z.string().uuid(),
  characterName: z.string().trim().min(1).max(60)
});

async function maybeAnnounceClosedPoll(pollId: string) {
  const admin = getAdminSupabase();
  const { data, error } = await admin.rpc('mark_poll_close_announced_if_needed', {
    p_poll_id: pollId
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return;

  const polls = await getAllPolls(20);
  const closedPoll = polls.find((poll) => poll.id === pollId);
  if (closedPoll) {
    await announcePollClosed(closedPoll);
  }
}

export async function POST(request: Request) {
  try {
    const body = voteSchema.parse(await request.json());
    const admin = getAdminSupabase();

    const { error } = await admin.rpc('cast_story_vote', {
      p_poll_id: body.pollId,
      p_story_arc_id: body.storyArcId,
      p_character_name: body.characterName
    });

    if (error) {
      return fail(error.message, 400);
    }

    const { data: pollRow, error: pollError } = await admin
      .from('story_polls')
      .select('id, status')
      .eq('id', body.pollId)
      .maybeSingle();

    if (pollError) {
      throw new Error(pollError.message);
    }

    if (pollRow?.status === 'closed') {
      await maybeAnnounceClosedPoll(body.pollId);
    }

    const state = await getPublicState();
    return ok(state);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail('Invalid vote payload.', 400, error.flatten());
    }

    return fail('Could not cast vote.', 500, error instanceof Error ? error.message : error);
  }
}
