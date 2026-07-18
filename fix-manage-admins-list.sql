-- ============================================================
-- YCDI Programme Hub - fix for the Manage Admins error
-- Paste this into Supabase > SQL Editor and click Run.
--
-- "structure of query does not match function result type" means the
-- column types coming out of the query don't exactly match what the
-- function said it would return. Supabase stores email addresses (and
-- some name columns) as "character varying" rather than "text", and
-- Postgres treats those as different types even though they hold the
-- same thing.
--
-- Casting each column explicitly settles it.
--
-- Safe to run more than once. Nothing else changes.
-- ============================================================

create or replace function public.admin_list_profiles()
returns table (
  id           uuid,
  full_name    text,
  role         text,
  chapter_id   uuid,
  chapter_name text,
  is_admin     boolean,
  email        text
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can view this.';
  end if;
  return query
    select
      p.id::uuid,
      p.full_name::text,
      p.role::text,
      p.chapter_id::uuid,
      c.name::text,
      p.is_admin::boolean,
      u.email::text
    from public.profiles p
    left join public.chapters c on c.id = p.chapter_id
    left join auth.users u on u.id = p.id
    order by p.full_name;
end;
$$;

grant execute on function public.admin_list_profiles() to authenticated;

-- Done. Reopen More > Manage Admins in the app, it should load now.
