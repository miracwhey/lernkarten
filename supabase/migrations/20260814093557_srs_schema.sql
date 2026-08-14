-- Reviews: append-only Ereignis-Log; SRS-Zustand entsteht per Replay im Client (Algo-Wechsel = Replay).
create table public.review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  lesson_slug text not null,
  card_index int not null check (card_index >= 0),
  grade text not null check (grade in ('again', 'hard', 'good', 'easy')),
  reviewed_at timestamptz not null default now()
);

alter table public.review_events enable row level security;

create policy "owner insert" on public.review_events
  for insert to authenticated with check (user_id = auth.uid());
create policy "owner read" on public.review_events
  for select to authenticated using (user_id = auth.uid());

-- Append-only hart: kein Update/Delete für Client-Rollen.
revoke update, delete on public.review_events from anon, authenticated;

create index review_events_user_card
  on public.review_events (user_id, lesson_slug, card_index, reviewed_at);

-- Vom User gebaute Lektionen (Worker schreibt sie in Schritt 5; Bundle-Lektionen bleiben in der App).
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  slug text not null unique,
  title text not null,
  source text not null default '',
  cards jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.lessons enable row level security;

create policy "owner read" on public.lessons
  for select to authenticated using (user_id = auth.uid());
create policy "owner insert" on public.lessons
  for insert to authenticated with check (user_id = auth.uid());;
