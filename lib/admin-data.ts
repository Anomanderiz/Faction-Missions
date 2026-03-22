import { getAdminSupabase } from '@/lib/supabase/admin';
import { getAllPolls, getOpenPoll, getRecentPolls } from '@/lib/polls';
import type { AdminAppState, Mission, StoryArc } from '@/lib/types';

export async function getAdminState(): Promise<AdminAppState> {
  const admin = getAdminSupabase();

  const [missionsResult, storyResult, openPoll, recentPolls, allPolls] = await Promise.all([
    admin.from('faction_missions').select('*').order('updated_at', { ascending: false }),
    admin.from('story_arcs').select('*').order('updated_at', { ascending: false }),
    getOpenPoll(),
    getRecentPolls(5),
    getAllPolls(20)
  ]);

  if (missionsResult.error) throw new Error(missionsResult.error.message);
  if (storyResult.error) throw new Error(storyResult.error.message);

  const missions = (missionsResult.data ?? []) as Mission[];
  const storyArcs = (storyResult.data ?? []) as StoryArc[];

  return {
    missions: missions.filter((mission) => !mission.is_archived),
    archivedMissions: missions.filter((mission) => mission.is_archived),
    storyArcs: storyArcs.filter((arc) => !arc.is_archived),
    archivedStoryArcs: storyArcs.filter((arc) => arc.is_archived),
    openPoll,
    recentPolls,
    allPolls
  };
}
