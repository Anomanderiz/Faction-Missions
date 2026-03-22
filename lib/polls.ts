import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Poll, PollOption, PollTally, StoryArc, Vote } from '@/lib/types';

interface PollRow {
  id: string;
  status: 'open' | 'closed' | 'cancelled';
  max_votes: number;
  winner_story_arc_id: string | null;
  opened_at: string;
  closed_at: string | null;
  open_announced_at: string | null;
  close_announced_at: string | null;
}

function buildTallies(arcs: StoryArc[], votes: Vote[]): PollTally[] {
  const tallies = new Map<string, PollTally>();

  for (const arc of arcs) {
    tallies.set(arc.id, {
      story_arc_id: arc.id,
      title: arc.title,
      type: arc.type,
      vote_count: 0,
      voters: []
    });
  }

  for (const vote of votes) {
    const tally = tallies.get(vote.story_arc_id);
    if (!tally) continue;
    tally.vote_count += 1;
    tally.voters.push(vote.character_name);
  }

  return [...tallies.values()].sort((a, b) => {
    if (b.vote_count !== a.vote_count) return b.vote_count - a.vote_count;
    return a.title.localeCompare(b.title);
  });
}

export async function hydratePolls(polls: PollRow[]): Promise<Poll[]> {
  const admin = getAdminSupabase();
  const hydrated: Poll[] = [];

  for (const poll of polls) {
    const { data: optionsRows, error: optionsError } = await admin
      .from('story_poll_options')
      .select('poll_id, story_arc_id')
      .eq('poll_id', poll.id);

    if (optionsError) {
      throw new Error(optionsError.message);
    }

    const arcIds = [...new Set((optionsRows ?? []).map((row) => row.story_arc_id))];

    const { data: arcsRows, error: arcsError } = await admin
      .from('story_arcs')
      .select('*')
      .in('id', arcIds.length ? arcIds : ['00000000-0000-0000-0000-000000000000']);

    if (arcsError) {
      throw new Error(arcsError.message);
    }

    const arcs = (arcsRows ?? []) as StoryArc[];
    const arcMap = new Map(arcs.map((arc) => [arc.id, arc]));

    const { data: votesRows, error: votesError } = await admin
      .from('story_votes')
      .select('id, poll_id, story_arc_id, character_name, created_at')
      .eq('poll_id', poll.id)
      .order('created_at', { ascending: true });

    if (votesError) {
      throw new Error(votesError.message);
    }

    const votes = (votesRows ?? []) as Vote[];
    const options: PollOption[] = (optionsRows ?? [])
      .map((row) => ({
        poll_id: row.poll_id,
        story_arc_id: row.story_arc_id,
        story_arc: arcMap.get(row.story_arc_id)
      }))
      .filter((row): row is PollOption => Boolean(row.story_arc));

    hydrated.push({
      ...poll,
      options,
      votes,
      tallies: buildTallies(options.map((option) => option.story_arc), votes)
    });
  }

  return hydrated;
}

export async function getOpenPoll(): Promise<Poll | null> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('story_polls')
    .select('*')
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;
  const [poll] = await hydratePolls([data as PollRow]);
  return poll ?? null;
}

export async function getRecentPolls(limit = 5): Promise<Poll[]> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('story_polls')
    .select('*')
    .neq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return hydratePolls((data ?? []) as PollRow[]);
}

export async function getAllPolls(limit = 20): Promise<Poll[]> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('story_polls')
    .select('*')
    .order('opened_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return hydratePolls((data ?? []) as PollRow[]);
}
