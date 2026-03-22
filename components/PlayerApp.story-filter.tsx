'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { FACTIONS, MISSION_STATUSES, STORY_TYPES } from '@/lib/constants';
import { fetchJson } from '@/lib/client-fetch';
import { DB_SCHEMA } from '@/lib/db';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import type { Mission, PublicAppState, StoryArcType } from '@/lib/types';

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export function PlayerApp() {
  const [state, setState] = useState<PublicAppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missionSearch, setMissionSearch] = useState('');
  const [selectedFactions, setSelectedFactions] = useState<string[]>([...FACTIONS]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['Available', 'Accepted']);
  const [storyTypeFilter, setStoryTypeFilter] = useState<'ALL' | StoryArcType>('ALL');
  const [expandedArcId, setExpandedArcId] = useState<string | null>(null);
  const [characterName, setCharacterName] = useState('');
  const [selectedVoteArcId, setSelectedVoteArcId] = useState('');
  const [voteBusy, setVoteBusy] = useState(false);
  const refreshTimer = useRef<number | null>(null);

  const loadState = useCallback(async () => {
    try {
      const nextState = await fetchJson<PublicAppState>('/api/public/state', { method: 'GET', cache: 'no-store' });
      setState(nextState);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the board.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  useEffect(() => {
    const supabase = getBrowserSupabase();

    const scheduleRefresh = () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        void loadState();
      }, 350);
    };

    const channel = supabase
      .channel('waterdeep-public-board')
      .on('postgres_changes', { event: '*', schema: DB_SCHEMA, table: 'story_votes' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: DB_SCHEMA, table: 'story_polls' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: DB_SCHEMA, table: 'story_poll_options' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: DB_SCHEMA, table: 'story_arcs' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: DB_SCHEMA, table: 'faction_missions' }, scheduleRefresh)
      .subscribe();

    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [loadState]);

  const filteredMissions = useMemo(() => {
    if (!state) return [];

    const needle = missionSearch.trim().toLowerCase();
    return state.missions.filter((mission) => {
      if (!selectedFactions.includes(mission.faction)) return false;
      if (!selectedStatuses.includes(mission.status)) return false;
      if (!needle) return true;

      const haystack = [mission.title, mission.location, mission.hook, mission.reward, mission.assigned_to ?? '', mission.notes ?? '']
        .join(' ')
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [missionSearch, selectedFactions, selectedStatuses, state]);

  const filteredStoryArcs = useMemo(() => {
    if (!state) return [];
    if (storyTypeFilter === 'ALL') return state.storyArcs;
    return state.storyArcs.filter((arc) => arc.type === storyTypeFilter);
  }, [state, storyTypeFilter]);

  const voteOptions = state?.openPoll?.options ?? [];

  useEffect(() => {
    if (!state?.openPoll?.options?.length) return;

    const optionIds = state.openPoll.options.map((option) => option.story_arc_id);
    if (!selectedVoteArcId || !optionIds.includes(selectedVoteArcId)) {
      setSelectedVoteArcId(optionIds[0]);
    }
  }, [selectedVoteArcId, state]);

  async function handleVoteSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state?.openPoll || !selectedVoteArcId) return;

    setVoteBusy(true);
    try {
      const nextState = await fetchJson<PublicAppState>('/api/public/vote', {
        method: 'POST',
        body: JSON.stringify({
          pollId: state.openPoll.id,
          storyArcId: selectedVoteArcId,
          characterName
        })
      });

      setState(nextState);
      setCharacterName('');
      setError(null);
    } catch (voteError) {
      setError(voteError instanceof Error ? voteError.message : 'Could not cast vote.');
    } finally {
      setVoteBusy(false);
    }
  }

  function toggleArrayValue(current: string[], value: string) {
    return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  }

  return (
    <main className="shell">
      <header className="page-header glass-card">
        <div>
          <p className="eyebrow">Player View</p>
          <h1>Waterdeep Campaign Board</h1>
          <p className="lede">Browse faction missions, read story arcs, and cast your vote when the table needs a direction.</p>
        </div>
        <div className="header-actions">
          <Link className="button button-secondary" href="/">
            Home
          </Link>
          <Link className="button button-secondary" href="/dm/login">
            DM Login
          </Link>
        </div>
      </header>

      {error ? <div className="banner banner-error">{error}</div> : null}
      {loading && !state ? <div className="glass-card">Loading the board…</div> : null}

      {state ? (
        <div className="stack-lg">
          <section className="glass-card stack-md">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Live Vote</p>
                <h2>Current storyline ballot</h2>
              </div>
              <div className="muted-text">Updates arrive automatically.</div>
            </div>

            {state.openPoll ? (
              <>
                <div className="poll-grid">
                  {state.openPoll.tallies.map((tally) => (
                    <article key={tally.story_arc_id} className="poll-option-card">
                      <div className="badge-row">
                        <span className="badge badge-gold">{tally.type}</span>
                        <span className="badge">{tally.vote_count} / {state.openPoll?.max_votes}</span>
                      </div>
                      <h3>{tally.title}</h3>
                      <p className="muted-text">
                        {tally.voters.length ? `Voted: ${tally.voters.join(', ')}` : 'No votes cast yet.'}
                      </p>
                    </article>
                  ))}
                </div>

                <form className="vote-form" onSubmit={handleVoteSubmit}>
                  <div className="field-grid">
                    <label>
                      Storyline
                      <select value={selectedVoteArcId} onChange={(event) => setSelectedVoteArcId(event.target.value)} required>
                        {voteOptions.map((option) => (
                          <option key={option.story_arc_id} value={option.story_arc_id}>
                            {option.story_arc.title} ({option.story_arc.type})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Character name
                      <input
                        value={characterName}
                        onChange={(event) => setCharacterName(event.target.value)}
                        maxLength={60}
                        placeholder="Who is casting this vote?"
                        required
                      />
                    </label>
                  </div>
                  <div className="button-row">
                    <button className="button button-primary" type="submit" disabled={voteBusy}>
                      {voteBusy ? 'Casting vote…' : 'Cast vote'}
                    </button>
                    <span className="muted-text">The ballot closes automatically at {state.openPoll.max_votes} votes.</span>
                  </div>
                </form>
              </>
            ) : (
              <p className="muted-text">No live vote is currently open. When the DM starts one, it will appear here.</p>
            )}
          </section>

          <section className="glass-card stack-md">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Storylines</p>
                <h2>Available arcs</h2>
              </div>
              <div className="muted-text">Tap an arc to open the blurb.</div>
            </div>

            <div className="filter-block">
              <span className="filter-label">Filter by arc type</span>
              <div className="chip-grid">
                <button
                  className={`chip ${storyTypeFilter === 'ALL' ? 'chip-active' : ''}`}
                  onClick={() => setStoryTypeFilter('ALL')}
                  type="button"
                >
                  All
                </button>
                {STORY_TYPES.map((type) => (
                  <button
                    key={type}
                    className={`chip ${storyTypeFilter === type ? 'chip-active' : ''}`}
                    onClick={() => setStoryTypeFilter(type)}
                    type="button"
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="story-grid">
              {filteredStoryArcs.map((arc) => {
                const expanded = expandedArcId === arc.id;
                return (
                  <article key={arc.id} className={`story-card ${expanded ? 'story-card-expanded' : ''}`}>
                    <button className="story-toggle" onClick={() => setExpandedArcId(expanded ? null : arc.id)} type="button">
                      <div>
                        <div className="badge-row">
                          <span className="badge badge-gold">{arc.type}</span>
                        </div>
                        <h3>{arc.title}</h3>
                      </div>
                      <span className="muted-text">{expanded ? 'Hide' : 'Read'}</span>
                    </button>
                    {expanded ? <p className="story-blurb">{arc.blurb}</p> : null}
                  </article>
                );
              })}
            </div>

            {!filteredStoryArcs.length ? <p className="muted-text">No story arcs match that filter.</p> : null}
          </section>

          <section className="glass-card stack-md">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Faction Missions</p>
                <h2>Mission board</h2>
              </div>
              <div className="muted-text">Filter by faction, status, or text.</div>
            </div>

            <div className="stack-sm">
              <label>
                Search missions
                <input
                  value={missionSearch}
                  onChange={(event) => setMissionSearch(event.target.value)}
                  placeholder="Title, location, hook, reward…"
                />
              </label>

              <div className="filter-block">
                <span className="filter-label">Factions</span>
                <div className="chip-grid">
                  {FACTIONS.map((faction) => (
                    <label key={faction} className={`chip ${selectedFactions.includes(faction) ? 'chip-active' : ''}`}>
                      <input
                        checked={selectedFactions.includes(faction)}
                        onChange={() => setSelectedFactions((current) => toggleArrayValue(current, faction))}
                        type="checkbox"
                      />
                      <span>{faction}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="filter-block">
                <span className="filter-label">Status</span>
                <div className="chip-grid">
                  {MISSION_STATUSES.map((status) => (
                    <label key={status} className={`chip ${selectedStatuses.includes(status) ? 'chip-active' : ''}`}>
                      <input
                        checked={selectedStatuses.includes(status)}
                        onChange={() => setSelectedStatuses((current) => toggleArrayValue(current, status))}
                        type="checkbox"
                      />
                      <span>{status}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mission-grid">
              {filteredMissions.map((mission: Mission) => (
                <article key={mission.id} className="mission-card">
                  <div className="badge-row">
                    <span className="badge badge-gold">{mission.faction}</span>
                    <span className="badge">{mission.status}</span>
                  </div>
                  <h3>{mission.title}</h3>
                  <p className="muted-text">
                    {mission.location || 'Unspecified location'} • Reward: {mission.reward || '—'}
                  </p>
                  <p>{mission.hook}</p>
                  <div className="detail-grid">
                    <span><strong>Assigned:</strong> {mission.assigned_to || 'Unclaimed'}</span>
                    <span><strong>Updated:</strong> {formatDate(mission.updated_at)}</span>
                  </div>
                  {mission.notes ? <p className="muted-text">Notes: {mission.notes}</p> : null}
                </article>
              ))}
            </div>
          </section>

          <section className="glass-card stack-md">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Recent results</p>
                <h2>Closed ballots</h2>
              </div>
            </div>
            <div className="story-grid">
              {state.recentPolls.map((poll) => {
                const winner = poll.tallies.find((tally) => tally.story_arc_id === poll.winner_story_arc_id) ?? poll.tallies[0];
                return (
                  <article key={poll.id} className="story-card story-card-expanded">
                    <div className="badge-row">
                      <span className="badge">{poll.status}</span>
                      <span className="badge">Opened {formatDate(poll.opened_at)}</span>
                    </div>
                    <h3>{winner ? `Winner: ${winner.title}` : 'No winner recorded'}</h3>
                    <p className="muted-text">
                      {poll.tallies.map((tally) => `${tally.title}: ${tally.vote_count}`).join(' • ')}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
