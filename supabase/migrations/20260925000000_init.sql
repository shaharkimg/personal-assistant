-- Personal Assistant — initial schema.
--
-- Security model:
--   * Every user-owned table carries user_id and has Row Level Security enabled.
--   * Policies only ever compare against auth.uid(); no table is readable across users.
--   * The AI model never touches the database. All reads/writes happen through the app's
--     tool layer (under the user's JWT, so RLS applies) or through edge functions.
--   * activity_log is append-only for clients (no UPDATE policy).

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- profiles & settings (long-term user preferences that are structured)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'Asia/Jerusalem',
  locale text not null default 'he-IL',
  proactivity text not null default 'balanced' check (proactivity in ('off', 'low', 'balanced', 'high')),
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '07:30',
  morning_brief_time time default '08:00',
  evening_review_time time default '20:30',
  working_hours_start time not null default '09:00',
  working_hours_end time not null default '18:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  color text,
  icon text,
  status text not null default 'active' check (status in ('active', 'archived')),
  deadline date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_user_idx on public.projects (user_id, status);

-- ---------------------------------------------------------------------------
-- people (entities). contact_ref is the *device-local* contact id; we never
-- mirror the address book to the server, only people the user works with.
-- ---------------------------------------------------------------------------
create table public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  contact_ref text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, display_name)
);

create table public.project_people (
  project_id uuid not null references public.projects (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text,
  primary key (project_id, person_id)
);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  description text,
  status text not null default 'inbox'
    check (status in ('inbox', 'today', 'upcoming', 'waiting', 'someday', 'completed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  due_date date,
  due_time time,
  remind_at timestamptz,
  completed_at timestamptz,
  project_id uuid references public.projects (id) on delete set null,
  tags text[] not null default '{}',
  source text not null default 'manual'
    check (source in ('manual', 'assistant', 'voice', 'inbox', 'share', 'camera', 'recurrence', 'quick_capture')),
  related_person text,
  related_person_id uuid references public.people (id) on delete set null,
  follow_up_date date,
  -- {"freq":"daily|weekly|monthly|yearly","interval":1,"byWeekday":[0..6],"until":"YYYY-MM-DD"}
  recurrence jsonb,
  recurrence_parent_id uuid references public.tasks (id) on delete set null,
  estimated_minutes int check (estimated_minutes is null or estimated_minutes between 1 and 1440),
  rolled_over_count int not null default 0
);
create index tasks_user_status_idx on public.tasks (user_id, status);
create index tasks_user_due_idx on public.tasks (user_id, due_date);
create index tasks_title_trgm on public.tasks using gin (title extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- waiting-for (smart follow-up)
-- ---------------------------------------------------------------------------
create table public.waiting_for (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person text not null check (char_length(person) between 1 and 120),
  person_id uuid references public.people (id) on delete set null,
  subject text not null check (char_length(subject) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expected_response_date date,
  status text not null default 'open' check (status in ('open', 'received', 'cancelled')),
  related_task_id uuid references public.tasks (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  notes text,
  last_nudged_at timestamptz,
  resolved_at timestamptz
);
create index waiting_user_status_idx on public.waiting_for (user_id, status, expected_response_date);

-- ---------------------------------------------------------------------------
-- notes
-- ---------------------------------------------------------------------------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text,
  body text not null,
  kind text not null default 'note' check (kind in ('note', 'idea', 'reference', 'link')),
  url text,
  project_id uuid references public.projects (id) on delete set null,
  tags text[] not null default '{}',
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_user_idx on public.notes (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- documents + chunks (RAG)
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint,
  storage_path text not null,
  extra_storage_paths text[] not null default '{}',
  source text not null default 'upload' check (source in ('upload', 'camera', 'scan', 'share', 'chat')),
  project_id uuid references public.projects (id) on delete set null,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'ready', 'failed')),
  error text,
  char_count int,
  chunk_count int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_user_idx on public.documents (user_id, created_at desc);

create table public.document_chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  chunk_index int not null,
  content text not null,
  heading text,
  embedding extensions.vector(1536),
  fts tsvector generated always as (to_tsvector('simple', coalesce(heading, '') || ' ' || content)) stored,
  unique (document_id, chunk_index)
);
create index document_chunks_user_idx on public.document_chunks (user_id, document_id);
create index document_chunks_fts_idx on public.document_chunks using gin (fts);
create index document_chunks_embedding_idx on public.document_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- Hybrid retrieval (vector + full text, reciprocal-rank fusion). SECURITY INVOKER,
-- so RLS limits results to the caller's own chunks.
create or replace function public.match_document_chunks(
  query_embedding extensions.vector(1536),
  query_text text,
  match_count int default 8,
  filter_document_ids uuid[] default null
) returns table (
  id bigint,
  document_id uuid,
  chunk_index int,
  content text,
  heading text,
  score double precision
)
language sql stable security invoker set search_path = public, extensions as $$
  with semantic as (
    select c.id, row_number() over (order by c.embedding <=> query_embedding) as rank
    from public.document_chunks c
    where query_embedding is not null
      and c.embedding is not null
      and (filter_document_ids is null or c.document_id = any (filter_document_ids))
    order by c.embedding <=> query_embedding
    limit match_count * 4
  ),
  keyword as (
    select c.id, row_number() over (order by ts_rank_cd(c.fts, q) desc) as rank
    from public.document_chunks c, websearch_to_tsquery('simple', query_text) q
    where c.fts @@ q
      and (filter_document_ids is null or c.document_id = any (filter_document_ids))
    order by ts_rank_cd(c.fts, q) desc
    limit match_count * 4
  ),
  fused as (
    select coalesce(s.id, k.id) as id,
           coalesce(1.0 / (60 + s.rank), 0) + coalesce(1.0 / (60 + k.rank), 0) as score
    from semantic s full outer join keyword k on s.id = k.id
  )
  select c.id, c.document_id, c.chunk_index, c.content, c.heading, f.score
  from fused f join public.document_chunks c on c.id = f.id
  order by f.score desc
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- universal inbox
-- ---------------------------------------------------------------------------
create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('text', 'voice', 'file', 'image', 'link')),
  raw_text text,
  url text,
  document_id uuid references public.documents (id) on delete set null,
  suggested_type text check (suggested_type in ('task', 'note', 'document', 'reminder', 'event', 'waiting_for', 'reference')),
  suggestion jsonb,
  confidence real,
  final_type text check (final_type in ('task', 'note', 'document', 'reminder', 'event', 'waiting_for', 'reference')),
  status text not null default 'new' check (status in ('new', 'processed', 'archived')),
  processed_ref_type text,
  processed_ref_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inbox_user_status_idx on public.inbox_items (user_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- memory: long-term preferences / facts. Never written automatically:
-- source tells whether the user stated it explicitly or approved a suggestion.
-- ---------------------------------------------------------------------------
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category text not null check (category in ('preference', 'fact', 'routine', 'relationship', 'work')),
  content text not null check (char_length(content) between 1 and 500),
  source text not null check (source in ('user_explicit', 'user_approved')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index memories_user_idx on public.memories (user_id, category);

-- ---------------------------------------------------------------------------
-- conversations (short-term context lives here; old ones can be purged)
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text,
  project_id uuid references public.projects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_user_idx on public.conversations (user_id, updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  -- plain text for display
  text text,
  -- provider-agnostic content blocks (tool calls/results, provider state) for replay
  blocks jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- activity log (audit). Append-only from the client.
-- ---------------------------------------------------------------------------
create table public.activity_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  actor text not null check (actor in ('assistant', 'user', 'system')),
  action text not null,
  entity_type text,
  entity_id text,
  summary text not null,
  metadata jsonb not null default '{}'
);
create index activity_user_idx on public.activity_log (user_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- push tokens & AI usage (rate limiting; written only by edge functions)
-- ---------------------------------------------------------------------------
create table public.push_tokens (
  token text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  requests int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (user_id, day)
);

-- p_count = 1 when starting a request (enforces the limit), 0 when recording tokens afterwards.
create or replace function public.bump_ai_usage(p_user uuid, p_input bigint, p_output bigint, p_limit int, p_count int default 1)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_requests int;
begin
  insert into public.ai_usage as u (user_id, day, requests, input_tokens, output_tokens)
  values (p_user, current_date, p_count, p_input, p_output)
  on conflict (user_id, day) do update
    set requests = u.requests + p_count,
        input_tokens = u.input_tokens + excluded.input_tokens,
        output_tokens = u.output_tokens + excluded.output_tokens
  returning requests into v_requests;
  if p_count > 0 and v_requests > p_limit then
    raise exception 'daily AI request limit reached' using errcode = 'P0001';
  end if;
  return v_requests;
end $$;
revoke all on function public.bump_ai_usage(uuid, bigint, bigint, int, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles', 'projects', 'people', 'tasks', 'waiting_for', 'notes',
                           'documents', 'inbox_items', 'conversations']
  loop
    execute format('create trigger %I_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['projects', 'people', 'project_people', 'tasks', 'waiting_for', 'notes',
                           'documents', 'document_chunks', 'inbox_items', 'memories',
                           'conversations', 'messages', 'push_tokens']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all
                    using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- activity log: insert/select/delete own rows, never update.
alter table public.activity_log enable row level security;
create policy "read own activity" on public.activity_log for select using (user_id = auth.uid());
create policy "append own activity" on public.activity_log for insert with check (user_id = auth.uid());
create policy "delete own activity" on public.activity_log for delete using (user_id = auth.uid());

-- ai usage: readable by the owner, writable only via bump_ai_usage (service role).
alter table public.ai_usage enable row level security;
create policy "read own usage" on public.ai_usage for select using (user_id = auth.uid());

-- Chunks reference a document owned by the same user.
create or replace function public.check_chunk_owner() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from public.documents d where d.id = new.document_id and d.user_id = new.user_id) then
    raise exception 'chunk owner mismatch';
  end if;
  return new;
end $$;
create trigger document_chunks_owner before insert on public.document_chunks
  for each row execute function public.check_chunk_owner();

-- ---------------------------------------------------------------------------
-- Storage: private bucket, objects live under "<user_id>/..."
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 26214400)
on conflict (id) do nothing;

create policy "own documents read" on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own documents write" on storage.objects for insert
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own documents delete" on storage.objects for delete
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
