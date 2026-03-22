export type MissionStatus = 'Available' | 'Accepted' | 'Completed' | 'Failed';
export type StoryArcType = 'MSQ' | 'SQ' | 'MSQ/SQ';
export type PollStatus = 'open' | 'closed' | 'cancelled';

export interface Mission {
  id: string;
  faction: string;
  title: string;
  reward: string;
  location: string;
  hook: string;
  status: MissionStatus;
  assigned_to: string | null;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface StoryArc {
  id: string;
  title: string;
  type: StoryArcType;
  blurb: string;
  is_visible: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Vote {
  id: string;
  poll_id: string;
  story_arc_id: string;
  character_name: string;
  created_at: string;
}

export interface PollOption {
  poll_id: string;
  story_arc_id: string;
  story_arc: StoryArc;
}

export interface PollTally {
  story_arc_id: string;
  title: string;
  type: StoryArcType;
  vote_count: number;
  voters: string[];
}

export interface Poll {
  id: string;
  status: PollStatus;
  max_votes: number;
  winner_story_arc_id: string | null;
  opened_at: string;
  closed_at: string | null;
  open_announced_at: string | null;
  close_announced_at: string | null;
  options: PollOption[];
  votes: Vote[];
  tallies: PollTally[];
}

export interface PublicAppState {
  missions: Mission[];
  storyArcs: StoryArc[];
  openPoll: Poll | null;
  recentPolls: Poll[];
}

export interface AdminAppState extends PublicAppState {
  archivedMissions: Mission[];
  archivedStoryArcs: StoryArc[];
  allPolls: Poll[];
}
