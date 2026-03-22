create extension if not exists pgcrypto;

create schema if not exists campaign_board;

grant usage on schema campaign_board to anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'campaign_board'
      and t.typname = 'mission_status'
  ) then
    create type campaign_board.mission_status as enum ('Available', 'Accepted', 'Completed', 'Failed');
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'campaign_board'
      and t.typname = 'story_arc_type'
  ) then
    create type campaign_board.story_arc_type as enum ('MSQ', 'SQ', 'MSQ/SQ');
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'campaign_board'
      and t.typname = 'poll_status'
  ) then
    create type campaign_board.poll_status as enum ('open', 'closed', 'cancelled');
  end if;
end $$;

create table if not exists campaign_board.faction_missions (
  id uuid primary key default gen_random_uuid(),
  faction text not null,
  title text not null,
  reward text not null default '',
  location text not null default '',
  hook text not null default '',
  status campaign_board.mission_status not null default 'Available',
  assigned_to text,
  notes text,
  is_archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists campaign_board.story_arcs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type campaign_board.story_arc_type not null,
  blurb text not null,
  is_visible boolean not null default true,
  is_archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists campaign_board.story_polls (
  id uuid primary key default gen_random_uuid(),
  status campaign_board.poll_status not null default 'open',
  max_votes integer not null default 5 check (max_votes > 0),
  winner_story_arc_id uuid references campaign_board.story_arcs (id) on delete set null,
  opened_at timestamptz not null default timezone('utc', now()),
  closed_at timestamptz,
  open_announced_at timestamptz,
  close_announced_at timestamptz
);

create table if not exists campaign_board.story_poll_options (
  poll_id uuid not null references campaign_board.story_polls (id) on delete cascade,
  story_arc_id uuid not null references campaign_board.story_arcs (id) on delete cascade,
  primary key (poll_id, story_arc_id)
);

create table if not exists campaign_board.story_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references campaign_board.story_polls (id) on delete cascade,
  story_arc_id uuid not null references campaign_board.story_arcs (id) on delete cascade,
  character_name text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists campaign_board_story_votes_one_vote_per_character_per_poll
  on campaign_board.story_votes (poll_id, lower(btrim(character_name)));

create index if not exists campaign_board_faction_missions_active_idx
  on campaign_board.faction_missions (is_archived, updated_at desc);

create index if not exists campaign_board_story_arcs_visibility_idx
  on campaign_board.story_arcs (is_archived, is_visible, updated_at desc);

create index if not exists campaign_board_story_polls_status_idx
  on campaign_board.story_polls (status, opened_at desc);

create index if not exists campaign_board_story_votes_poll_idx
  on campaign_board.story_votes (poll_id, created_at asc);

create or replace function campaign_board.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists faction_missions_set_updated_at on campaign_board.faction_missions;
create trigger faction_missions_set_updated_at
before update on campaign_board.faction_missions
for each row
execute function campaign_board.set_updated_at();

drop trigger if exists story_arcs_set_updated_at on campaign_board.story_arcs;
create trigger story_arcs_set_updated_at
before update on campaign_board.story_arcs
for each row
execute function campaign_board.set_updated_at();

alter table campaign_board.faction_missions enable row level security;
alter table campaign_board.story_arcs enable row level security;
alter table campaign_board.story_polls enable row level security;
alter table campaign_board.story_poll_options enable row level security;
alter table campaign_board.story_votes enable row level security;

grant select on all tables in schema campaign_board to anon, authenticated;
grant all privileges on all tables in schema campaign_board to service_role;
grant usage on all sequences in schema campaign_board to service_role;
alter default privileges in schema campaign_board grant select on tables to anon, authenticated;
alter default privileges in schema campaign_board grant all privileges on tables to service_role;
alter default privileges in schema campaign_board grant usage on sequences to service_role;

drop policy if exists "Public can read active faction missions" on campaign_board.faction_missions;
create policy "Public can read active faction missions"
  on campaign_board.faction_missions
  for select
  using (is_archived = false);

drop policy if exists "Public can read visible story arcs" on campaign_board.story_arcs;
create policy "Public can read visible story arcs"
  on campaign_board.story_arcs
  for select
  using (is_archived = false and is_visible = true);

drop policy if exists "Public can read polls" on campaign_board.story_polls;
create policy "Public can read polls"
  on campaign_board.story_polls
  for select
  using (true);

drop policy if exists "Public can read poll options" on campaign_board.story_poll_options;
create policy "Public can read poll options"
  on campaign_board.story_poll_options
  for select
  using (true);

drop policy if exists "Public can read votes" on campaign_board.story_votes;
create policy "Public can read votes"
  on campaign_board.story_votes
  for select
  using (true);

create or replace function campaign_board.cast_story_vote(
  p_poll_id uuid,
  p_story_arc_id uuid,
  p_character_name text
)
returns jsonb
language plpgsql
security definer
set search_path = campaign_board, public
as $$
declare
  v_poll campaign_board.story_polls%rowtype;
  v_total_votes integer;
  v_winner_story_arc_id uuid;
  v_trimmed_name text;
begin
  v_trimmed_name := btrim(coalesce(p_character_name, ''));

  if v_trimmed_name = '' then
    raise exception 'Character name is required.';
  end if;

  select *
    into v_poll
  from campaign_board.story_polls
  where id = p_poll_id
  for update;

  if not found then
    raise exception 'Poll not found.';
  end if;

  if v_poll.status <> 'open' then
    raise exception 'That poll is no longer open.';
  end if;

  if not exists (
    select 1
    from campaign_board.story_poll_options
    where poll_id = p_poll_id
      and story_arc_id = p_story_arc_id
  ) then
    raise exception 'That storyline is not on the ballot.';
  end if;

  insert into campaign_board.story_votes (poll_id, story_arc_id, character_name)
  values (p_poll_id, p_story_arc_id, v_trimmed_name);

  select count(*)
    into v_total_votes
  from campaign_board.story_votes
  where poll_id = p_poll_id;

  if v_total_votes >= v_poll.max_votes then
    select ranked.story_arc_id
      into v_winner_story_arc_id
    from (
      select
        story_arc_id,
        count(*) as vote_count,
        min(created_at) as first_vote_at
      from campaign_board.story_votes
      where poll_id = p_poll_id
      group by story_arc_id
      order by vote_count desc, first_vote_at asc
      limit 1
    ) as ranked;

    update campaign_board.story_polls
      set
        status = 'closed',
        winner_story_arc_id = v_winner_story_arc_id,
        closed_at = timezone('utc', now())
    where id = p_poll_id;
  end if;

  return jsonb_build_object(
    'poll_id', p_poll_id,
    'total_votes', v_total_votes
  );
exception
  when unique_violation then
    raise exception 'That character has already voted in this poll.';
end;
$$;

grant execute on function campaign_board.cast_story_vote(uuid, uuid, text) to anon, authenticated, service_role;

create or replace function campaign_board.create_story_poll(
  p_story_arc_ids uuid[],
  p_max_votes integer default 5
)
returns uuid
language plpgsql
security definer
set search_path = campaign_board, public
as $$
declare
  v_existing_open uuid;
  v_poll_id uuid;
  v_story_arc_id uuid;
  v_clean_ids uuid[];
begin
  v_clean_ids := array(
    select distinct unnest(p_story_arc_ids)
  );

  if coalesce(array_length(v_clean_ids, 1), 0) = 0 then
    raise exception 'At least one storyline must be selected.';
  end if;

  if p_max_votes is null or p_max_votes < 1 then
    raise exception 'max_votes must be at least 1.';
  end if;

  select id into v_existing_open
  from campaign_board.story_polls
  where status = 'open'
  limit 1
  for update;

  if v_existing_open is not null then
    raise exception 'There is already an open poll.';
  end if;

  foreach v_story_arc_id in array v_clean_ids
  loop
    if not exists (
      select 1 from campaign_board.story_arcs
      where id = v_story_arc_id
        and is_archived = false
        and is_visible = true
    ) then
      raise exception 'One or more selected story arcs are invalid or hidden.';
    end if;
  end loop;

  insert into campaign_board.story_polls (status, max_votes)
  values ('open', p_max_votes)
  returning id into v_poll_id;

  insert into campaign_board.story_poll_options (poll_id, story_arc_id)
  select v_poll_id, unnest(v_clean_ids);

  return v_poll_id;
end;
$$;

grant execute on function campaign_board.create_story_poll(uuid[], integer) to service_role;

create or replace function campaign_board.mark_poll_open_announced_if_needed(p_poll_id uuid)
returns boolean
language plpgsql
security definer
set search_path = campaign_board, public
as $$
declare
  v_poll campaign_board.story_polls%rowtype;
begin
  select *
    into v_poll
  from campaign_board.story_polls
  where id = p_poll_id
  for update;

  if not found then
    return false;
  end if;

  if v_poll.open_announced_at is not null then
    return false;
  end if;

  update campaign_board.story_polls
    set open_announced_at = timezone('utc', now())
  where id = p_poll_id;

  return true;
end;
$$;

grant execute on function campaign_board.mark_poll_open_announced_if_needed(uuid) to service_role;

create or replace function campaign_board.mark_poll_close_announced_if_needed(p_poll_id uuid)
returns boolean
language plpgsql
security definer
set search_path = campaign_board, public
as $$
declare
  v_poll campaign_board.story_polls%rowtype;
begin
  select *
    into v_poll
  from campaign_board.story_polls
  where id = p_poll_id
  for update;

  if not found then
    return false;
  end if;

  if v_poll.status <> 'closed' then
    return false;
  end if;

  if v_poll.close_announced_at is not null then
    return false;
  end if;

  update campaign_board.story_polls
    set close_announced_at = timezone('utc', now())
  where id = p_poll_id;

  return true;
end;
$$;

grant execute on function campaign_board.mark_poll_close_announced_if_needed(uuid) to service_role;

alter default privileges in schema campaign_board grant execute on functions to service_role;
alter default privileges in schema campaign_board grant execute on functions to anon, authenticated;

alter table campaign_board.faction_missions replica identity full;
alter table campaign_board.story_arcs replica identity full;
alter table campaign_board.story_polls replica identity full;
alter table campaign_board.story_poll_options replica identity full;
alter table campaign_board.story_votes replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table campaign_board.faction_missions;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table campaign_board.story_arcs;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table campaign_board.story_polls;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table campaign_board.story_poll_options;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table campaign_board.story_votes;
  exception when duplicate_object then null;
  end;
end $$;
