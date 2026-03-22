import { getAdminSupabase } from '@/lib/supabase/admin';
import { getOpenPoll, getRecentPolls } from '@/lib/polls';
import type { Mission, PublicAppState, StoryArc } from '@/lib/types';

export async function getPublicState(): Promise<PublicAppState> {
  const admin = getAdminSupabase();

  const [{ data: missions, error: missionsError }, { data: storyArcs, error: storyError }, openPoll, recentPolls] = await Promise.all([
    admin
      .from('faction_missions')
      .select('*')
      .eq('is_archived', false)
      .order('updated_at', { ascending: false }),
    admin
      .from('story_arcs')
      .select('*')
      .eq('is_archived', false)
      .eq('is_visible', true)
      .order('updated_at', { ascending: false }),
    getOpenPoll(),
    getRecentPolls(5)
  ]);

  if (missionsError) throw new Error(missionsError.message);
  if (storyError) throw new Error(storyError.message);

  return {
    missions: (missions ?? []) as Mission[],
    storyArcs: (storyArcs ?? []) as StoryArc[],
    openPoll,
    recentPolls
  };
}
