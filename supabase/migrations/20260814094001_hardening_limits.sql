-- Längen-/Größen-Grenzen: Client-Rollen können keine Riesen-Blobs oder Endlos-Strings ablegen.
alter table public.review_events
  add constraint review_slug_len check (char_length(lesson_slug) between 1 and 64);

alter table public.lessons
  add constraint lesson_slug_len check (char_length(slug) between 1 and 64),
  add constraint lesson_title_len check (char_length(title) between 1 and 200),
  add constraint lesson_source_len check (char_length(source) <= 500),
  add constraint lesson_cards_count check (jsonb_array_length(cards) between 1 and 60),
  add constraint lesson_cards_size check (pg_column_size(cards) <= 262144);

-- Flood-Guard: Insert-Rate pro User deckeln (RLS begrenzt den Count auf eigene Rows,
-- daher SECURITY INVOKER). 120 Reviews/min ist weit über echtem Lerntempo.
create index review_events_user_time on public.review_events (user_id, reviewed_at);

create function public.review_rate_guard() returns trigger
language plpgsql security invoker as $$
begin
  if (select count(*) from public.review_events
      where user_id = auth.uid()
        and reviewed_at > now() - interval '1 minute') >= 120 then
    raise exception 'rate limit: zu viele Reviews pro Minute';
  end if;
  return new;
end $$;

create trigger review_rate_guard
  before insert on public.review_events
  for each row execute function public.review_rate_guard();

-- Lektionen: 20 pro Tag pro User reicht fürs Erstellen mit Abstand.
create function public.lesson_rate_guard() returns trigger
language plpgsql security invoker as $$
begin
  if (select count(*) from public.lessons
      where user_id = auth.uid()
        and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate limit: zu viele Lektionen pro Tag';
  end if;
  return new;
end $$;

create trigger lesson_rate_guard
  before insert on public.lessons
  for each row execute function public.lesson_rate_guard();;
