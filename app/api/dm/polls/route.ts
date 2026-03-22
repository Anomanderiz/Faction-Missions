import { z } from 'zod';
import { announcePollOpened } from '@/lib/discord';
import { requireAdmin } from '@/lib/guards';
import { fail, ok } from '@/lib/http';
import { getOpenPoll } from '@/lib/polls';
import { getAdminSupabase } from '@/lib/supabase/admin';

const openSchema = z.object({
  storyArcIds: z.array(z.string().uuid()).min(1),
  maxVotes: z.number().int().min(1).max(50).default(5)
});

const patchSchema = z.object({
  pollId: z.string().uuid(),
  action: z.enum(['cancel'])
});

async function maybeAnnounceOpenedPoll(pollId: string) {
  const admin = getAdminSupabase();
  const { data, error } = await admin.rpc('mark_poll_open_announced_if_needed', {
    p_poll_id: pollId
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return;

  const poll = await getOpenPoll();
  if (poll && poll.id === pollId) {
    await announcePollOpened(poll);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = openSchema.parse(await request.json());
    const admin = getAdminSupabase();

    const { data: pollId, error: createError } = await admin.rpc('create_story_poll', {
      p_story_arc_ids: body.storyArcIds,
      p_max_votes: body.maxVotes
    });

    if (createError) return fail(createError.message, 400);

    await maybeAnnounceOpenedPoll(pollId);
    const updatedOpenPoll = await getOpenPoll();
    return ok(updatedOpenPoll);
  } catch (error) {
    if (error instanceof z.ZodError) return fail('Invalid poll payload.', 400, error.flatten());
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message === 'UNAUTHORIZED') return fail('Not authorised.', 401);
    return fail('Could not open poll.', 500, message);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = patchSchema.parse(await request.json());
    const admin = getAdminSupabase();

    if (body.action === 'cancel') {
      const { data, error } = await admin
        .from('story_polls')
        .update({ status: 'cancelled', closed_at: new Date().toISOString() })
        .eq('id', body.pollId)
        .eq('status', 'open')
        .select('*')
        .single();

      if (error) return fail(error.message, 400);
      return ok(data);
    }

    return fail('Unsupported poll action.', 400);
  } catch (error) {
    if (error instanceof z.ZodError) return fail('Invalid poll action payload.', 400, error.flatten());
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message === 'UNAUTHORIZED') return fail('Not authorised.', 401);
    return fail('Could not update poll.', 500, message);
  }
}
