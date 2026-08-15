-- Foto-Fluss: aus fotografierten Seiten/Covern wird ein Job. Die Erkennung läuft vor
-- dem Anlegen (Edge Function), der Nutzer bestätigt Quelle und Thema auf der
-- Bestätigungs-Karte — deshalb ist topic bei kind='photo' Pflicht, source_text trägt
-- den OCR-Block der Fotos.
alter table public.generation_jobs
  drop constraint generation_jobs_kind_check,
  add constraint generation_jobs_kind_check check (kind in ('topic', 'text', 'photo'));

-- Die bestätigte Quelle (z.B. Buchtitel, Autor) — wird später in lessons.source
-- durchgereicht, damit die Lektion ihre Herkunft nennt.
alter table public.generation_jobs
  add column source text,
  add constraint job_source_len check (source is null or char_length(source) <= 300);

-- Bestandszweige ('topic'/'text') unverändert gültig; 'photo' braucht BEIDES.
alter table public.generation_jobs
  drop constraint job_input,
  add constraint job_input check (
    (kind = 'topic' and topic is not null and source_text is null)
    or (kind = 'text' and source_text is not null and topic is null)
    or (kind = 'photo' and topic is not null and source_text is not null)
  );
