create extension if not exists pgcrypto;

create type public.mission_status as enum ('Available', 'Accepted', 'Completed', 'Failed');
create type public.story_arc_type as enum ('MSQ', 'SQ', 'MSQ/SQ');
create type public.poll_status as enum ('open', 'closed', 'cancelled');

create table if not exists public.faction_missions (
  id uuid primary key default gen_random_uuid(),
  faction text not null,
  title text not null,
  reward text not null default '',
  location text not null default '',
  hook text not null default '',
  status public.mission_status not null default 'Available',
  assigned_to text,
  notes text,
  is_archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.story_arcs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type public.story_arc_type not null,
  blurb text not null,
  is_visible boolean not null default true,
  is_archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.story_polls (
  id uuid primary key default gen_random_uuid(),
  status public.poll_status not null default 'open',
  max_votes integer not null default 5 check (max_votes > 0),
  winner_story_arc_id uuid references public.story_arcs (id) on delete set null,
  opened_at timestamptz not null default timezone('utc', now()),
  closed_at timestamptz,
  open_announced_at timestamptz,
  close_announced_at timestamptz
);

create table if not exists public.story_poll_options (
  poll_id uuid not null references public.story_polls (id) on delete cascade,
  story_arc_id uuid not null references public.story_arcs (id) on delete cascade,
  primary key (poll_id, story_arc_id)
);

create table if not exists public.story_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.story_polls (id) on delete cascade,
  story_arc_id uuid not null references public.story_arcs (id) on delete cascade,
  character_name text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists story_votes_one_vote_per_character_per_poll
  on public.story_votes (poll_id, lower(btrim(character_name)));

create index if not exists faction_missions_active_idx
  on public.faction_missions (is_archived, updated_at desc);

create index if not exists story_arcs_visibility_idx
  on public.story_arcs (is_archived, is_visible, updated_at desc);

create index if not exists story_polls_status_idx
  on public.story_polls (status, opened_at desc);

create index if not exists story_votes_poll_idx
  on public.story_votes (poll_id, created_at asc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists faction_missions_set_updated_at on public.faction_missions;
create trigger faction_missions_set_updated_at
before update on public.faction_missions
for each row
execute function public.set_updated_at();

drop trigger if exists story_arcs_set_updated_at on public.story_arcs;
create trigger story_arcs_set_updated_at
before update on public.story_arcs
for each row
execute function public.set_updated_at();

alter table public.faction_missions enable row level security;
alter table public.story_arcs enable row level security;
alter table public.story_polls enable row level security;
alter table public.story_poll_options enable row level security;
alter table public.story_votes enable row level security;

drop policy if exists "Public can read active faction missions" on public.faction_missions;
create policy "Public can read active faction missions"
  on public.faction_missions
  for select
  using (is_archived = false);

drop policy if exists "Public can read visible story arcs" on public.story_arcs;
create policy "Public can read visible story arcs"
  on public.story_arcs
  for select
  using (is_archived = false and is_visible = true);

drop policy if exists "Public can read polls" on public.story_polls;
create policy "Public can read polls"
  on public.story_polls
  for select
  using (true);

drop policy if exists "Public can read poll options" on public.story_poll_options;
create policy "Public can read poll options"
  on public.story_poll_options
  for select
  using (true);

drop policy if exists "Public can read votes" on public.story_votes;
create policy "Public can read votes"
  on public.story_votes
  for select
  using (true);

create or replace function public.cast_story_vote(
  p_poll_id uuid,
  p_story_arc_id uuid,
  p_character_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll public.story_polls%rowtype;
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
  from public.story_polls
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
    from public.story_poll_options
    where poll_id = p_poll_id
      and story_arc_id = p_story_arc_id
  ) then
    raise exception 'That storyline is not on the ballot.';
  end if;

  insert into public.story_votes (poll_id, story_arc_id, character_name)
  values (p_poll_id, p_story_arc_id, v_trimmed_name);

  select count(*)
    into v_total_votes
  from public.story_votes
  where poll_id = p_poll_id;

  if v_total_votes >= v_poll.max_votes then
    select ranked.story_arc_id
      into v_winner_story_arc_id
    from (
      select
        story_arc_id,
        count(*) as vote_count,
        min(created_at) as first_vote_at
      from public.story_votes
      where poll_id = p_poll_id
      group by story_arc_id
      order by vote_count desc, first_vote_at asc
      limit 1
    ) as ranked;

    update public.story_polls
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

grant execute on function public.cast_story_vote(uuid, uuid, text) to anon, authenticated, service_role;

create or replace function public.create_story_poll(
  p_story_arc_ids uuid[],
  p_max_votes integer default 5
)
returns uuid
language plpgsql
security definer
set search_path = public
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
  from public.story_polls
  where status = 'open'
  limit 1
  for update;

  if v_existing_open is not null then
    raise exception 'There is already an open poll.';
  end if;

  foreach v_story_arc_id in array v_clean_ids
  loop
    if not exists (
      select 1 from public.story_arcs
      where id = v_story_arc_id
        and is_archived = false
        and is_visible = true
    ) then
      raise exception 'One or more selected story arcs are invalid or hidden.';
    end if;
  end loop;

  insert into public.story_polls (status, max_votes)
  values ('open', p_max_votes)
  returning id into v_poll_id;

  insert into public.story_poll_options (poll_id, story_arc_id)
  select v_poll_id, unnest(v_clean_ids);

  return v_poll_id;
end;
$$;

grant execute on function public.create_story_poll(uuid[], integer) to service_role;

create or replace function public.mark_poll_open_announced_if_needed(p_poll_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll public.story_polls%rowtype;
begin
  select *
    into v_poll
  from public.story_polls
  where id = p_poll_id
  for update;

  if not found then
    return false;
  end if;

  if v_poll.open_announced_at is not null then
    return false;
  end if;

  update public.story_polls
    set open_announced_at = timezone('utc', now())
  where id = p_poll_id;

  return true;
end;
$$;

grant execute on function public.mark_poll_open_announced_if_needed(uuid) to service_role;

create or replace function public.mark_poll_close_announced_if_needed(p_poll_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll public.story_polls%rowtype;
begin
  select *
    into v_poll
  from public.story_polls
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

  update public.story_polls
    set close_announced_at = timezone('utc', now())
  where id = p_poll_id;

  return true;
end;
$$;

grant execute on function public.mark_poll_close_announced_if_needed(uuid) to service_role;

alter table public.faction_missions replica identity full;
alter table public.story_arcs replica identity full;
alter table public.story_polls replica identity full;
alter table public.story_poll_options replica identity full;
alter table public.story_votes replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.faction_missions;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.story_arcs;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.story_polls;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.story_poll_options;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.story_votes;
  exception when duplicate_object then null;
  end;
end $$;
