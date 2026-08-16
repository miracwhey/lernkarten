#!/bin/zsh
# Prüft die Datenbank-Seite des UX-Blocks gegen den LOKALEN Stack (supabase start):
# Stufenzeiten, Rückfall auf eine frühere Stufe, Wiederholung samt Deckel und die
# Zugriffsrechte. Jede Prüfung nennt Soll und Ist — ein „lief durch" ohne Zahlen
# wäre kein Beweis.
#
#   supabase start && probes/bau-detail-sql.sh
set -euo pipefail

# psql kommt aus dem Datenbank-Container: auf dem Mac ist keins installiert, und
# eins nur für diese Probe zu installieren wäre eine Abhängigkeit ohne Nutzen.
BEHAELTER="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)"
[[ -n "$BEHAELTER" ]] || { echo "Kein laufender Supabase-Stack — erst 'supabase start'."; exit 1; }

docker exec -i "$BEHAELTER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q <<'SQL'
\set QUIET on
\pset pager off
-- Nur die Prüfzeilen sollen zu sehen sein; die kommen als NOTICE, alles andere
-- wären leere Ergebnistabellen, in denen der eine Fehlschlag untergeht.
\o /dev/null

create or replace function pg_temp.pruefe(name text, ist text, soll text) returns void
language plpgsql as $$
begin
  if ist is not distinct from soll then
    raise notice 'OK   % → %', name, coalesce(ist, 'NULL');
  else
    raise exception 'FEHLGESCHLAGEN % : ist=% soll=%', name, coalesce(ist, 'NULL'), coalesce(soll, 'NULL');
  end if;
end $$;

-- Erst aufräumen, dann anlegen: bricht ein Lauf in der Mitte ab, soll der nächste
-- die Ursache melden und nicht an den Resten des vorigen scheitern.
delete from public.generation_jobs where id = '33333333-3333-3333-3333-333333333333';
delete from auth.users where email like '%@probe.local';

-- Zwei Nutzer, damit der Eigentümer-Vergleich nicht nur behauptet wird.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'ich@probe.local', '', now(), now()),
       ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'fremd@probe.local', '', now(), now());

insert into public.generation_jobs (id, user_id, kind, topic, depth)
values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
        'topic', 'Probe', 'kompakt');

-- ── Claim eröffnet die erste Stufe ───────────────────────────────────────────
select stage as claim_stage from public.claim_next_job() \gset
select pg_temp.pruefe('claim setzt die Stufe', :'claim_stage', 'quellen');
select pg_temp.pruefe('claim setzt ihre Startzeit',
  (select (stage_started ? 'quellen')::text from public.generation_jobs), 'true');

-- ── Stufenwechsel schreibt Zeiten fort ───────────────────────────────────────
select public.set_job_stage('33333333-3333-3333-3333-333333333333', 'karten');
select public.set_job_stage('33333333-3333-3333-3333-333333333333', 'pruefen');
select pg_temp.pruefe('drei Stufen tragen eine Startzeit',
  (select count(*)::text from public.generation_jobs, jsonb_object_keys(stage_started)), '3');
select pg_temp.pruefe('die Zeiten stehen in der Reihenfolge der Stufen',
  ((stage_started->>'quellen')::timestamptz <= (stage_started->>'karten')::timestamptz
   and (stage_started->>'karten')::timestamptz <= (stage_started->>'pruefen')::timestamptz)::text,
  'true') from public.generation_jobs;

-- Rückfall auf ein anderes Modell der Kette: die spätere Stufe muss verschwinden,
-- sonst läge ihre Startzeit in der Zukunft und die Dauer wäre negativ.
select public.set_job_stage('33333333-3333-3333-3333-333333333333', 'karten');
select pg_temp.pruefe('Rückfall wirft die spätere Stufe raus',
  (select (stage_started ? 'pruefen')::text from public.generation_jobs), 'false');
select pg_temp.pruefe('…und behält die frühere',
  (select (stage_started ? 'quellen')::text from public.generation_jobs), 'true');

-- Eine unbekannte Stufe bricht laut ab, statt still einen Wert einzutragen, den
-- kein Leser kennt.
do $$ begin
  begin
    perform public.set_job_stage('33333333-3333-3333-3333-333333333333', 'kaffeekochen');
    raise exception 'FEHLGESCHLAGEN unbekannte Stufe ging durch';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FEHLGESCHLAGEN%' then raise; end if;
    raise notice 'OK   unbekannte Stufe abgelehnt → %', sqlerrm;
  end;
end $$;

-- ── Wiederholung ─────────────────────────────────────────────────────────────
-- Scheitern lässt den Auftrag der Worker (service_role), wiederholen die App
-- (authenticated) — die Rollen werden im Test genauso getrennt wie im Betrieb.
update public.generation_jobs set status = 'failed', error = 'kaputt';

do $$ begin
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', false);
  begin
    perform public.retry_job('33333333-3333-3333-3333-333333333333');
    raise exception 'FEHLGESCHLAGEN ein fremder Nutzer konnte wiederholen';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FEHLGESCHLAGEN%' then raise; end if;
    raise notice 'OK   fremder Nutzer abgelehnt → %', sqlerrm;
  end;
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', false);
  perform public.retry_job('33333333-3333-3333-3333-333333333333');
  perform set_config('role', 'postgres', false);
end $$;

-- Direkt gegen die Zeile geprüft: über \gset käme ein NULL gar nicht erst an,
-- und genau NULL ist hier das Soll für Stufe und Fehler.
select pg_temp.pruefe('Wiederholung → zurück in die Queue', status, 'queued'),
       pg_temp.pruefe('Wiederholung leert die Stufe', stage, NULL),
       pg_temp.pruefe('Wiederholung leert den Fehler', error, NULL),
       pg_temp.pruefe('Wiederholung leert die Stufenzeiten', stage_started::text, '{}'),
       pg_temp.pruefe('Wiederholung setzt die Versuche zurück', attempts::text, '0'),
       pg_temp.pruefe('Wiederholung wird gezählt', retries::text, '1')
  from public.generation_jobs;
select pg_temp.pruefe('es bleibt EIN Auftrag, kein zweiter',
  (select count(*)::text from public.generation_jobs), '1');

-- Deckel: die vierte Wiederholung prallt ab (Kosten pro Auftrag begrenzt).
do $$
declare i int;
begin
  for i in 2..4 loop
    perform set_config('role', 'postgres', false);
    update public.generation_jobs set status = 'failed';
    perform set_config('role', 'authenticated', false);
    perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', false);
    begin
      perform public.retry_job('33333333-3333-3333-3333-333333333333');
      if i = 4 then raise exception 'FEHLGESCHLAGEN die vierte Wiederholung ging durch'; end if;
    exception when sqlstate 'P0001' then
      if sqlerrm like 'FEHLGESCHLAGEN%' then raise; end if;
      if i < 4 then raise; end if;
      raise notice 'OK   vierte Wiederholung abgelehnt → %', sqlerrm;
    end;
  end loop;
  perform set_config('role', 'postgres', false);
end $$;

select pg_temp.pruefe('der Zähler steht am Deckel',
  (select retries::text from public.generation_jobs), '3');

-- ── Rechte ───────────────────────────────────────────────────────────────────
select pg_temp.pruefe('set_job_stage: nur der Worker',
  has_function_privilege('authenticated', 'public.set_job_stage(uuid, text)', 'execute')::text, 'false');
select pg_temp.pruefe('set_job_stage: service_role darf',
  has_function_privilege('service_role', 'public.set_job_stage(uuid, text)', 'execute')::text, 'true');
select pg_temp.pruefe('retry_job: angemeldete Nutzer dürfen',
  has_function_privilege('authenticated', 'public.retry_job(uuid)', 'execute')::text, 'true');
select pg_temp.pruefe('retry_job: anon nicht',
  has_function_privilege('anon', 'public.retry_job(uuid)', 'execute')::text, 'false');
select pg_temp.pruefe('claim_next_job liefert weiter eine Menge (leer statt NULL-Zeile)',
  (select proretset::text from pg_proc where proname = 'claim_next_job'), 'true');

delete from public.generation_jobs where id = '33333333-3333-3333-3333-333333333333';
delete from auth.users where email like '%@probe.local';
SQL
echo "ALLE PRÜFUNGEN GRÜN"
