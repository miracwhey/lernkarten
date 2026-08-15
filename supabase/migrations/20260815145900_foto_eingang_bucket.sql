-- Zwischenlager für die Foto-Erkennung: die App lädt jedes Foto einzeln hoch,
-- während der Nutzer noch fotografiert, und ruft die Erkennung danach nur noch
-- mit den Pfaden. Grund ist gemessen: ein Stapel aus 4 Fotos war als base64 im
-- Function-Body 2,66 MB und riss über Mobilfunk mitten im Upload ab (Server sah
-- den Request nie). Einzelne 0,5-MB-Uploads sind je für sich wiederholbar.
--
-- Der Eingang ist kein Archiv: die Function löscht jedes Foto direkt nach der
-- Erkennung wieder, die App räumt beim Abbruch auf. Nichts hier ist auf Dauer
-- gedacht — der Worker bekommt ohnehin nur den OCR-Text, nie die Bilder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foto-eingang', 'foto-eingang', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

-- Ordner-Ebene 1 ist die Nutzer-Id: jeder sieht und schreibt ausschließlich im
-- eigenen Ordner. Die Function liest mit der service_role daran vorbei und prüft
-- die Zugehörigkeit deshalb selbst gegen das JWT — RLS deckt den Weg nicht ab.
create policy "foto_eingang_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'foto-eingang'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "foto_eingang_select_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'foto-eingang'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "foto_eingang_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'foto-eingang'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Kein UPDATE: ein Foto wird geschrieben, gelesen, gelöscht — nie überschrieben.
-- Damit kann ein zweiter Upload denselben Pfad auch nicht still ersetzen.
