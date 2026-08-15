-- Stündliches Aufräumen des Foto-Eingangs. Der Normalfall räumt sich selbst:
-- erkenne-foto löscht im finally, die App beim Abbruch. Hier bleibt nur, was von
-- keinem der beiden Wege erreicht wurde — App abgestürzt oder vor „Fertig" beendet.
--
-- Gelöscht wird in der Edge Function über die Storage-API, nicht hier per SQL:
-- ein DELETE auf storage.objects entfernt die Katalogzeile und lässt den Blob liegen.
--
-- Das Geheimnis steht NICHT in dieser Datei (das Repo ist öffentlich). Es liegt im
-- Vault unter 'eingang_cron_secret' und muss denselben Wert haben wie die
-- Function-Umgebungsvariable EINGANG_CRON_SECRET:
--   select vault.create_secret('<wert>', 'eingang_cron_secret', '…');
--   supabase secrets set EINGANG_CRON_SECRET='<wert>' --project-ref <ref>

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- pg_net-Aufrufe tragen die Postgres-Voreinstellung EXECUTE für PUBLIC. Das Schema
-- `net` ist zwar nicht über die API exponiert, aber ein Recht, das niemand braucht,
-- gehört entzogen — sonst hinge an jedem künftigen Zugang ein HTTP-Absender.
revoke execute on all functions in schema net from public, anon, authenticated;

-- Anstoß aus dem Cron: holt das Geheimnis aus dem Vault und ruft die Function.
-- SECURITY DEFINER, damit der Job nicht selbst am Vault berechtigt sein muss;
-- leerer search_path, deshalb ist jeder Bezeichner voll qualifiziert.
create or replace function public.eingang_aufraeumen_anstossen()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  geheim text;
begin
  select decrypted_secret into geheim
  from vault.decrypted_secrets
  where name = 'eingang_cron_secret';

  if geheim is null then
    raise exception 'eingang_cron_secret fehlt im Vault — Aufräumen würde still nichts tun';
  end if;

  perform net.http_post(
    url := 'https://putffdkzcefpfpamjqlt.supabase.co/functions/v1/eingang-aufraeumen',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', geheim
    ),
    body := '{}'::jsonb
  );
end;
$$;

-- Niemand außer dem Job braucht das: der Aufruf trägt das Vault-Geheimnis, und
-- eine SECURITY-DEFINER-Funktion ist ohne Entzug für jede Rolle ausführbar.
revoke execute on function public.eingang_aufraeumen_anstossen() from public, anon, authenticated;

-- Zur Minute 17, nicht zur vollen Stunde — dort drängeln sich alle Zeitpläne.
select cron.unschedule('eingang-aufraeumen')
where exists (select 1 from cron.job where jobname = 'eingang-aufraeumen');

select cron.schedule(
  'eingang-aufraeumen',
  '17 * * * *',
  $job$select public.eingang_aufraeumen_anstossen()$job$
);
