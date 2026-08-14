-- Advisor-Fix: search_path festnageln (alle Referenzen in den Funktionen sind schema-qualifiziert).
alter function public.review_rate_guard() set search_path = '';
alter function public.lesson_rate_guard() set search_path = '';;
