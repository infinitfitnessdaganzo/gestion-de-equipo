begin;

create table public.ep_daganzo_estado (
  propietario uuid primary key default auth.uid() references auth.users(id),
  revision integer not null default 0 check (revision >= 0),
  datos jsonb not null check (jsonb_typeof(datos) = 'object')
);

alter table public.ep_daganzo_estado enable row level security;
revoke all on public.ep_daganzo_estado from public, anon, authenticated;
grant select, insert, update on public.ep_daganzo_estado to authenticated;

create policy ep_daganzo_manager on public.ep_daganzo_estado
  for all to authenticated
  using (
    propietario = (select auth.uid())
    and lower((select auth.jwt())->>'email') = 'fernando.daganzo@infinitfitness.com.es'
  )
  with check (
    propietario = (select auth.uid())
    and lower((select auth.jwt())->>'email') = 'fernando.daganzo@infinitfitness.com.es'
  );

commit;
