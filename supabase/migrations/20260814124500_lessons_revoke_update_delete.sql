-- Defense-in-Depth wie bei generation_jobs: Clients ändern/löschen Lektionen
-- nie direkt (Schreibpfad ist ausschließlich der Worker mit service_role).
-- RLS blockt bereits mangels Policy; das hier ist die zweite Schicht.
revoke update, delete on public.lessons from anon, authenticated;
