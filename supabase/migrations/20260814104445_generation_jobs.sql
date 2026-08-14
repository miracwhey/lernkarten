-- Job-Queue für den Generierungs-Worker: die App legt Aufträge an, der lokale Worker
-- zieht sie als service_role mit claim_next_job() und schreibt die fertige Lektion.
-- Der Client sieht nur eigene Jobs und darf sie nach dem Anlegen nicht mehr anfassen.
create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  kind text not null check (kind in ('topic', 'text')),
  topic text,
  source_text text,
  -- Werte = die drei Tiefe-Kacheln im Erstellen-Sheet (Kompakt · Standard · Tief).
  depth text not null check (depth in ('kompakt', 'standard', 'tief')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  -- Bau-Stufe für die Bibliothekszeile (Wording aus Mockup S4).
  stage text check (stage is null or stage in ('quellen', 'karten', 'pruefen')),
  lesson_id uuid references public.lessons (id) on delete set null,
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Genau ein Eingabefeld je Art — ein Job ohne Eingabe ist kein Job.
  constraint job_input check (
    (kind = 'topic' and topic is not null and source_text is null)
    or (kind = 'text' and source_text is not null and topic is null)
  ),
  constraint job_topic_len check (topic is null or char_length(topic) between 1 and 200),
  constraint job_text_len check (source_text is null or char_length(source_text) between 1 and 20000),
  constraint job_error_len check (error is null or char_length(error) <= 500)
);

alter table public.generation_jobs enable row level security;

create policy "owner insert" on public.generation_jobs
  for insert to authenticated with check (user_id = auth.uid());
create policy "owner read" on public.generation_jobs
  for select to authenticated using (user_id = auth.uid());

-- Nur der Worker (service_role) schreibt Status/Stufe/Fehler fort; Client-Rollen nie.
revoke update, delete on public.generation_jobs from anon, authenticated;

create index generation_jobs_queue on public.generation_jobs (status, created_at);
create index generation_jobs_user_time on public.generation_jobs (user_id, created_at);

-- updated_at ist Wahrheit über die letzte Fortschreibung (Stale-Erkennung im Worker).
create function public.touch_updated_at() returns trigger
language plpgsql security invoker as $$
begin
  new.updated_at := now();
  return new;
end $$;
alter function public.touch_updated_at() set search_path = '';

create trigger generation_jobs_touch
  before update on public.generation_jobs
  for each row execute function public.touch_updated_at();

-- Flood-Guard wie bei lessons: 20 Bau-Aufträge pro Tag pro User. SECURITY INVOKER,
-- damit RLS den Count auf die eigenen Rows begrenzt.
create function public.generation_job_rate_guard() returns trigger
language plpgsql security invoker as $$
begin
  if (select count(*) from public.generation_jobs
      where user_id = auth.uid()
        and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate limit: zu viele Bau-Auftraege pro Tag';
  end if;
  return new;
end $$;
alter function public.generation_job_rate_guard() set search_path = '';

create trigger generation_job_rate_guard
  before insert on public.generation_jobs
  for each row execute function public.generation_job_rate_guard();

-- Job ziehen: genau einer, ohne Doppel-Vergabe bei mehreren Workern.
create function public.claim_next_job() returns public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare j public.generation_jobs;
begin
  select * into j from public.generation_jobs
   where status = 'queued'
   order by created_at
   limit 1
   for update skip locked;
  if not found then return null; end if;

  update public.generation_jobs
     set status = 'running', attempts = attempts + 1, stage = 'quellen', error = null
   where id = j.id
   returning * into j;
  return j;
end $$;

-- Postgres vergibt EXECUTE auf neue Funktionen per Default an PUBLIC — sofort entziehen,
-- sonst könnte jeder angemeldete Client fremde Jobs auf 'running' ziehen und auslesen
-- (SECURITY DEFINER umgeht die RLS-Policies oben).
revoke all on function public.claim_next_job() from public;
revoke all on function public.claim_next_job() from anon, authenticated;
grant execute on function public.claim_next_job() to service_role;

-- Realtime: die Bibliothek hört auf eigene Job-Zeilen (Status/Stufe/Fehler).
alter table public.generation_jobs replica identity full;
alter publication supabase_realtime add table public.generation_jobs;
