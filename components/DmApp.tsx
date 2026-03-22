'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FACTIONS, MISSION_STATUSES, STORY_TYPES } from '@/lib/constants';
import { fetchJson } from '@/lib/client-fetch';
import type { AdminAppState, Mission, MissionStatus, StoryArc, StoryArcType } from '@/lib/types';

type MissionFormState = {
  faction: string;
  title: string;
  reward: string;
  location: string;
  hook: string;
  status: MissionStatus;
  assigned_to: string;
  notes: string;
};

type StoryFormState = {
  title: string;
  type: StoryArcType;
  blurb: string;
  is_visible: boolean;
};

const emptyMissionForm: MissionFormState = {
  faction: FACTIONS[0],
  title: '',
  reward: '',
  location: '',
  hook: '',
  status: 'Available',
  assigned_to: '',
  notes: ''
};

const emptyStoryForm: StoryFormState = {
  title: '',
  type: 'MSQ',
  blurb: '',
  is_visible: true
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export function DmApp() {
  const router = useRouter();
  const [state, setState] = useState<AdminAppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [missionForm, setMissionForm] = useState<MissionFormState>(emptyMissionForm);
  const [storyForm, setStoryForm] = useState<StoryFormState>(emptyStoryForm);
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [editingStoryArc, setEditingStoryArc] = useState<StoryArc | null>(null);
  const [selectedPollArcIds, setSelectedPollArcIds] = useState<string[]>([]);
  const [maxVotes, setMaxVotes] = useState(5);

  async function loadState() {
    try {
      const nextState = await fetchJson<AdminAppState>('/api/dm/state', { method: 'GET', cache: 'no-store' });
      setState(nextState);
      setError(null);
      if (!selectedPollArcIds.length) {
        setSelectedPollArcIds(nextState.storyArcs.filter((arc) => arc.is_visible).slice(0, 2).map((arc) => arc.id));
      }
    } catch (loadError) {
      if (loadError instanceof Error && loadError.message === 'Not authorised.') {
        router.push('/dm/login');
        router.refresh();
        return;
      }
      setError(loadError instanceof Error ? loadError.message : 'Could not load admin state.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleArcOptions = useMemo(() => state?.storyArcs.filter((arc) => arc.is_visible) ?? [], [state]);

  async function withBusy<T>(label: string, work: () => Promise<T>) {
    setBusyLabel(label);
    setError(null);
    try {
      return await work();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Request failed.');
      throw actionError;
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleCreateMission(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await withBusy('Creating mission…', async () => {
      await fetchJson('/api/dm/missions', {
        method: 'POST',
        body: JSON.stringify(missionForm)
      });
      setMissionForm(emptyMissionForm);
      await loadState();
    });
  }

  async function handleSaveMission(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingMission) return;

    await withBusy('Saving mission…', async () => {
      await fetchJson('/api/dm/missions', {
        method: 'PATCH',
        body: JSON.stringify(editingMission)
      });
      setEditingMission(null);
      await loadState();
    });
  }

  async function archiveMission(id: string) {
    await withBusy('Archiving mission…', async () => {
      await fetchJson('/api/dm/missions', {
        method: 'DELETE',
        body: JSON.stringify({ id })
      });
      if (editingMission?.id === id) setEditingMission(null);
      await loadState();
    });
  }

  async function handleCreateStoryArc(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await withBusy('Creating story arc…', async () => {
      await fetchJson('/api/dm/story-arcs', {
        method: 'POST',
        body: JSON.stringify(storyForm)
      });
      setStoryForm(emptyStoryForm);
      await loadState();
    });
  }

  async function handleSaveStoryArc(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingStoryArc) return;

    await withBusy('Saving story arc…', async () => {
      await fetchJson('/api/dm/story-arcs', {
        method: 'PATCH',
        body: JSON.stringify(editingStoryArc)
      });
      setEditingStoryArc(null);
      await loadState();
    });
  }

  async function archiveStoryArc(id: string) {
    await withBusy('Archiving story arc…', async () => {
      await fetchJson('/api/dm/story-arcs', {
        method: 'DELETE',
        body: JSON.stringify({ id })
      });
      if (editingStoryArc?.id === id) setEditingStoryArc(null);
      await loadState();
    });
  }

  async function openPoll(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await withBusy('Opening poll…', async () => {
      await fetchJson('/api/dm/polls', {
        method: 'POST',
        body: JSON.stringify({ storyArcIds: selectedPollArcIds, maxVotes })
      });
      await loadState();
    });
  }

  async function cancelPoll(pollId: string) {
    await withBusy('Cancelling poll…', async () => {
      await fetchJson('/api/dm/polls', {
        method: 'PATCH',
        body: JSON.stringify({ pollId, action: 'cancel' })
      });
      await loadState();
    });
  }

  async function logout() {
    await withBusy('Logging out…', async () => {
      await fetchJson('/api/dm/logout', { method: 'POST' });
      router.push('/dm/login');
      router.refresh();
    });
  }

  function togglePollArc(id: string) {
    setSelectedPollArcIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  return (
    <main className="shell">
      <header className="page-header glass-card">
        <div>
          <p className="eyebrow">DM View</p>
          <h1>Campaign control panel</h1>
          <p className="lede">Edit faction missions in-app, manage story arcs, and open the live vote without touching a single JSON file.</p>
        </div>
        <div className="header-actions">
          <Link className="button button-secondary" href="/player">
            Player View
          </Link>
          <button className="button button-secondary" onClick={logout} type="button">
            Log out
          </button>
        </div>
      </header>

      {busyLabel ? <div className="banner">{busyLabel}</div> : null}
      {error ? <div className="banner banner-error">{error}</div> : null}
      {loading && !state ? <div className="glass-card">Loading the control panel…</div> : null}

      {state ? (
        <div className="admin-grid">
          <section className="glass-card stack-md">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Faction Missions</p>
                <h2>Add mission</h2>
              </div>
            </div>
            <form className="stack-md" onSubmit={handleCreateMission}>
              <div className="field-grid">
                <label>
                  Faction
                  <select value={missionForm.faction} onChange={(event) => setMissionForm((current) => ({ ...current, faction: event.target.value }))}>
                    {FACTIONS.map((faction) => (
                      <option key={faction} value={faction}>
                        {faction}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select value={missionForm.status} onChange={(event) => setMissionForm((current) => ({ ...current, status: event.target.value as typeof current.status }))}>
                    {MISSION_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="field-grid">
                <label>
                  Title
                  <input value={missionForm.title} onChange={(event) => setMissionForm((current) => ({ ...current, title: event.target.value }))} required />
                </label>
                <label>
                  Reward
                  <input value={missionForm.reward} onChange={(event) => setMissionForm((current) => ({ ...current, reward: event.target.value }))} />
                </label>
              </div>
              <div className="field-grid">
                <label>
                  Location
                  <input value={missionForm.location} onChange={(event) => setMissionForm((current) => ({ ...current, location: event.target.value }))} />
                </label>
                <label>
                  Assigned to
                  <input value={missionForm.assigned_to} onChange={(event) => setMissionForm((current) => ({ ...current, assigned_to: event.target.value }))} />
                </label>
              </div>
              <label>
                Hook
                <textarea value={missionForm.hook} onChange={(event) => setMissionForm((current) => ({ ...current, hook: event.target.value }))} rows={4} />
              </label>
              <label>
                Notes
                <textarea value={missionForm.notes} onChange={(event) => setMissionForm((current) => ({ ...current, notes: event.target.value }))} rows={3} />
              </label>
              <button className="button button-primary" type="submit">Add mission</button>
            </form>

            <div className="stack-sm">
              <h3>Current missions</h3>
              {state.missions.map((mission) => (
                <article className="admin-item" key={mission.id}>
                  <div>
                    <div className="badge-row">
                      <span className="badge badge-gold">{mission.faction}</span>
                      <span className="badge">{mission.status}</span>
                    </div>
                    <h4>{mission.title}</h4>
                    <p className="muted-text">{mission.location || 'Unspecified location'} • Updated {formatDate(mission.updated_at)}</p>
                  </div>
                  <div className="button-row wrap-row">
                    <button className="button button-secondary" onClick={() => setEditingMission(mission)} type="button">Edit</button>
                    <button className="button button-danger" onClick={() => archiveMission(mission.id)} type="button">Archive</button>
                  </div>
                </article>
              ))}
            </div>

            {editingMission ? (
              <form className="stack-md divider-top" onSubmit={handleSaveMission}>
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Mission editor</p>
                    <h3>{editingMission.title}</h3>
                  </div>
                  <button className="button button-secondary" onClick={() => setEditingMission(null)} type="button">Close</button>
                </div>
                <div className="field-grid">
                  <label>
                    Faction
                    <select value={editingMission.faction} onChange={(event) => setEditingMission((current) => current ? { ...current, faction: event.target.value } : current)}>
                      {FACTIONS.map((faction) => (
                        <option key={faction} value={faction}>{faction}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Status
                    <select value={editingMission.status} onChange={(event) => setEditingMission((current) => current ? { ...current, status: event.target.value as Mission['status'] } : current)}>
                      {MISSION_STATUSES.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="field-grid">
                  <label>
                    Title
                    <input value={editingMission.title} onChange={(event) => setEditingMission((current) => current ? { ...current, title: event.target.value } : current)} required />
                  </label>
                  <label>
                    Reward
                    <input value={editingMission.reward} onChange={(event) => setEditingMission((current) => current ? { ...current, reward: event.target.value } : current)} />
                  </label>
                </div>
                <div className="field-grid">
                  <label>
                    Location
                    <input value={editingMission.location} onChange={(event) => setEditingMission((current) => current ? { ...current, location: event.target.value } : current)} />
                  </label>
                  <label>
                    Assigned to
                    <input value={editingMission.assigned_to ?? ''} onChange={(event) => setEditingMission((current) => current ? { ...current, assigned_to: event.target.value } : current)} />
                  </label>
                </div>
                <label>
                  Hook
                  <textarea value={editingMission.hook} onChange={(event) => setEditingMission((current) => current ? { ...current, hook: event.target.value } : current)} rows={4} />
                </label>
                <label>
                  Notes
                  <textarea value={editingMission.notes ?? ''} onChange={(event) => setEditingMission((current) => current ? { ...current, notes: event.target.value } : current)} rows={3} />
                </label>
                <button className="button button-primary" type="submit">Save mission</button>
              </form>
            ) : null}
          </section>

          <section className="glass-card stack-md">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Storylines</p>
                <h2>Add story arc</h2>
              </div>
            </div>
            <form className="stack-md" onSubmit={handleCreateStoryArc}>
              <div className="field-grid">
                <label>
                  Title
                  <input value={storyForm.title} onChange={(event) => setStoryForm((current) => ({ ...current, title: event.target.value }))} required />
                </label>
                <label>
                  Type
                  <select value={storyForm.type} onChange={(event) => setStoryForm((current) => ({ ...current, type: event.target.value as typeof current.type }))}>
                    {STORY_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Blurb
                <textarea value={storyForm.blurb} onChange={(event) => setStoryForm((current) => ({ ...current, blurb: event.target.value }))} rows={5} required />
              </label>
              <label className="inline-checkbox">
                <input type="checkbox" checked={storyForm.is_visible} onChange={(event) => setStoryForm((current) => ({ ...current, is_visible: event.target.checked }))} />
                <span>Visible to players</span>
              </label>
              <button className="button button-primary" type="submit">Add story arc</button>
            </form>

            <div className="stack-sm">
              <h3>Current story arcs</h3>
              {state.storyArcs.map((arc) => (
                <article className="admin-item" key={arc.id}>
                  <div>
                    <div className="badge-row">
                      <span className="badge badge-gold">{arc.type}</span>
                      <span className="badge">{arc.is_visible ? 'Visible' : 'Hidden'}</span>
                    </div>
                    <h4>{arc.title}</h4>
                    <p className="muted-text">Updated {formatDate(arc.updated_at)}</p>
                  </div>
                  <div className="button-row wrap-row">
                    <button className="button button-secondary" onClick={() => setEditingStoryArc(arc)} type="button">Edit</button>
                    <button className="button button-danger" onClick={() => archiveStoryArc(arc.id)} type="button">Archive</button>
                  </div>
                </article>
              ))}
            </div>

            {editingStoryArc ? (
              <form className="stack-md divider-top" onSubmit={handleSaveStoryArc}>
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Story arc editor</p>
                    <h3>{editingStoryArc.title}</h3>
                  </div>
                  <button className="button button-secondary" onClick={() => setEditingStoryArc(null)} type="button">Close</button>
                </div>
                <div className="field-grid">
                  <label>
                    Title
                    <input value={editingStoryArc.title} onChange={(event) => setEditingStoryArc((current) => current ? { ...current, title: event.target.value } : current)} required />
                  </label>
                  <label>
                    Type
                    <select value={editingStoryArc.type} onChange={(event) => setEditingStoryArc((current) => current ? { ...current, type: event.target.value as StoryArc['type'] } : current)}>
                      {STORY_TYPES.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Blurb
                  <textarea value={editingStoryArc.blurb} onChange={(event) => setEditingStoryArc((current) => current ? { ...current, blurb: event.target.value } : current)} rows={5} />
                </label>
                <label className="inline-checkbox">
                  <input type="checkbox" checked={editingStoryArc.is_visible} onChange={(event) => setEditingStoryArc((current) => current ? { ...current, is_visible: event.target.checked } : current)} />
                  <span>Visible to players</span>
                </label>
                <button className="button button-primary" type="submit">Save story arc</button>
              </form>
            ) : null}
          </section>

          <section className="glass-card stack-md admin-grid-span-2">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Storyline Voting</p>
                <h2>Open a poll</h2>
              </div>
            </div>

            {state.openPoll ? (
              <div className="stack-md">
                <div className="banner">A vote is live. It will close automatically at {state.openPoll.max_votes} votes, or you can cancel it here.</div>
                <div className="poll-grid">
                  {state.openPoll.tallies.map((tally) => (
                    <article key={tally.story_arc_id} className="poll-option-card">
                      <div className="badge-row">
                        <span className="badge badge-gold">{tally.type}</span>
                        <span className="badge">{tally.vote_count}</span>
                      </div>
                      <h3>{tally.title}</h3>
                      <p className="muted-text">{tally.voters.length ? tally.voters.join(', ') : 'No votes yet.'}</p>
                    </article>
                  ))}
                </div>
                <div className="button-row">
                  <button className="button button-danger" onClick={() => cancelPoll(state.openPoll!.id)} type="button">Cancel open poll</button>
                </div>
              </div>
            ) : (
              <form className="stack-md" onSubmit={openPoll}>
                <label>
                  Votes required to close
                  <input type="number" min={1} max={50} value={maxVotes} onChange={(event) => setMaxVotes(Number(event.target.value || 5))} />
                </label>
                <div className="stack-sm">
                  <span className="filter-label">Eligible visible story arcs</span>
                  <div className="chip-grid">
                    {visibleArcOptions.map((arc) => (
                      <label key={arc.id} className={`chip ${selectedPollArcIds.includes(arc.id) ? 'chip-active' : ''}`}>
                        <input type="checkbox" checked={selectedPollArcIds.includes(arc.id)} onChange={() => togglePollArc(arc.id)} />
                        <span>{arc.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <button className="button button-primary" type="submit" disabled={selectedPollArcIds.length === 0}>Open poll</button>
              </form>
            )}

            <div className="stack-sm divider-top">
              <h3>Poll history</h3>
              {state.allPolls.map((poll) => {
                const winner = poll.tallies.find((tally) => tally.story_arc_id === poll.winner_story_arc_id) ?? poll.tallies[0];
                return (
                  <article key={poll.id} className="admin-item">
                    <div>
                      <div className="badge-row">
                        <span className="badge">{poll.status}</span>
                        <span className="badge">Opened {formatDate(poll.opened_at)}</span>
                      </div>
                      <h4>{winner ? `Winner: ${winner.title}` : 'No winner recorded'}</h4>
                      <p className="muted-text">{poll.tallies.map((tally) => `${tally.title}: ${tally.vote_count}`).join(' • ') || 'No votes recorded.'}</p>
                    </div>
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
