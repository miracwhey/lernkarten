-- Bau-Detail-Ebene (UX-Block, Mockup vom 16.08.): die Bibliothek zeigt künftig
-- nicht nur WELCHE Stufe läuft, sondern auch WIE LANGE jede gedauert hat — und
-- ein gescheiterter Auftrag lässt sich wiederholen, ohne neu zu fotografieren.
--
-- Dafür fehlen zwei Dinge in der Tabelle: die Startzeit JEDER Stufe (aus einem
-- einzelnen `stage`-Feld lässt sich keine Dauer rechnen) und ein Zähler für die
-- vom Nutzer angestoßenen Wiederholungen (sonst ist „Noch einmal bauen" ein
-- Knopf ohne Kostendeckel).

alter table public.generation_jobs
  -- Stufe → Startzeit. Additiv und nullfrei: Alt-Zeilen tragen '{}', die
  -- Detail-Ansicht zeigt dort schlicht keine Zeiten statt zu raten.
  add column stage_started jsonb not null default '{}'::jsonb,
  add column retries int not null default 0;

alter table public.generation_jobs
  add constraint job_retries_max check (retries between 0 and 3);

-- Stufenwechsel als EIN Chokepoint: Stufe setzen und Startzeit schreiben sind
-- derselbe Vorgang. Über PostgREST ginge das nicht atomar — die Map hängt von
-- ihrem eigenen alten Wert ab.
create function public.set_job_stage(job_id uuid, new_stage text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ordnung constant text[] := array['quellen', 'karten', 'pruefen'];
  idx int := array_position(ordnung, new_stage);
begin
  if idx is null then
    raise exception 'unbekannte Stufe: %', new_stage;
  end if;
  update public.generation_jobs j
     set stage = new_stage,
         -- Spätere Stufen fliegen aus der Map: fällt die Pipeline auf ein
         -- anderes Modell der Kette zurück, läuft „Karten schreiben" erneut —
         -- eine stehengebliebene Startzeit von „Prüfen" läge dann in der
         -- Zukunft und ergäbe negative Dauern.
         stage_started = (
           select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
             from jsonb_each(j.stage_started) as e
            where array_position(ordnung, e.key) < idx
         ) || jsonb_build_object(new_stage, now())
   where j.id = job_id;
end $$;

revoke all on function public.set_job_stage(uuid, text) from public;
revoke all on function public.set_job_stage(uuid, text) from anon, authenticated;
grant execute on function public.set_job_stage(uuid, text) to service_role;

-- „Noch einmal bauen": derselbe Auftrag geht zurück in die Queue. Kein neuer
-- Insert — sonst stünden zwei Zeilen für einen Auftrag in der Bibliothek, und
-- der Tagesdeckel zählte den Fehlversuch ein zweites Mal.
create function public.retry_job(job_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.generation_jobs
     set status = 'queued',
         stage = null,
         stage_started = '{}'::jsonb,
         error = null,
         -- Die Versuchszählung des Workers beginnt für den neuen Anlauf von
         -- vorn; gedeckelt wird stattdessen über retries.
         attempts = 0,
         retries = retries + 1
   -- SECURITY DEFINER umgeht RLS — der Eigentümer-Vergleich ist deshalb Pflicht
   -- und nicht bloß Redundanz zur Policy.
   where id = job_id
     and user_id = auth.uid()
     and status = 'failed'
     and retries < 3;
  if not found then
    raise exception 'Auftrag nicht wiederholbar';
  end if;
end $$;

revoke all on function public.retry_job(uuid) from public;
revoke all on function public.retry_job(uuid) from anon;
grant execute on function public.retry_job(uuid) to authenticated;

-- Der Claim eröffnet die erste Stufe — ohne diese Zeile hätte ein Auftrag eine
-- laufende Stufe ohne Startzeit, und die Detail-Ansicht könnte nicht sagen,
-- seit wann gebaut wird.
--
-- DROP statt CREATE OR REPLACE: der Rückgabetyp IST die Tabellenzeile, und die
-- hat oben zwei Spalten dazubekommen — Postgres wertet das als Typwechsel und
-- lehnt ein Ersetzen ab (42P13). SETOF bleibt (leere Queue = leeres Array, nicht
-- ein Composite aus lauter NULLs, das über PostgREST truthy ankäme).
drop function public.claim_next_job();

create function public.claim_next_job() returns setof public.generation_jobs
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
  if not found then return; end if;

  return query
    update public.generation_jobs
       set status = 'running', attempts = attempts + 1, stage = 'quellen', error = null,
           stage_started = jsonb_build_object('quellen', now())
     where id = j.id
     returning *;
end $$;

-- DROP/CREATE stellt den Default-EXECUTE an PUBLIC wieder her — erneut entziehen.
revoke all on function public.claim_next_job() from public;
revoke all on function public.claim_next_job() from anon, authenticated;
grant execute on function public.claim_next_job() to service_role;
