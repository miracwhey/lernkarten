-- claim_next_job gab bisher `public.generation_jobs` zurück und bei leerer Queue NULL.
-- Über PostgREST ist das nicht unterscheidbar: ein NULL-Composite kommt als Row aus
-- lauter NULL-Spalten an — ein truthy Objekt. Der Worker hielt „keine Arbeit" für
-- einen Job mit id=null. SETOF macht den Unterschied im Protokoll sichtbar:
-- kein Job = leeres Array.
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
       set status = 'running', attempts = attempts + 1, stage = 'quellen', error = null
     where id = j.id
     returning *;
end $$;

-- DROP/CREATE stellt den Default-EXECUTE an PUBLIC wieder her — erneut entziehen.
revoke all on function public.claim_next_job() from public;
revoke all on function public.claim_next_job() from anon, authenticated;
grant execute on function public.claim_next_job() to service_role;
