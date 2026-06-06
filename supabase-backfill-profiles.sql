-- Run AFTER supabase-schema.sql if you already had auth users before setup.
-- Creates missing profile rows so chats/messages foreign keys work.

insert into public.profiles (id, email, full_name)
select
  id,
  email,
  coalesce(
    raw_user_meta_data ->> 'full_name',
    raw_user_meta_data ->> 'name',
    ''
  )
from auth.users
where id not in (select id from public.profiles);
