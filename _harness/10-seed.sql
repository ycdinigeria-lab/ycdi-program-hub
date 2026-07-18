-- Seeds four accounts, then the shell script attacks them.
set test.uid = '';

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@ycdi.test'),
  ('22222222-2222-2222-2222-222222222222', 'nc@ycdi.test'),
  ('33333333-3333-3333-3333-333333333333', 'rc.benin@ycdi.test'),
  ('44444444-4444-4444-4444-444444444444', 'tm.benin@ycdi.test'),
  ('55555555-5555-5555-5555-555555555555', 'newbie@ycdi.test');

insert into public.profiles (id, full_name, role, chapter_id, is_admin) values
  ('11111111-1111-1111-1111-111111111111', 'Ada Admin',    'NC', null, true),
  ('22222222-2222-2222-2222-222222222222', 'Ngozi NC',     'NC', null, false),
  ('33333333-3333-3333-3333-333333333333', 'Rita RC',      'RC', (select id from public.chapters where name='Benin'), false),
  ('44444444-4444-4444-4444-444444444444', 'Tobi TeamMate','TM', (select id from public.chapters where name='Benin'), false);

-- A sign-up request waiting to be approved.
insert into public.pending_signups (id, email, full_name, phone, chapter_id, role_title)
values ('55555555-5555-5555-5555-555555555555', 'newbie@ycdi.test', 'Nkem Newbie',
        '+2348000000000', (select id from public.chapters where name='Auchi'), 'Media volunteer');

-- One approved programme for Benin, and one for Auchi.
insert into public.programs (id, title, chapter_id, status, students, submitted_by)
values
 ('aaaaaaaa-0000-0000-0000-000000000001', 'Benin school visit',
  (select id from public.chapters where name='Benin'), 'Approved', 40,
  '33333333-3333-3333-3333-333333333333'),
 ('aaaaaaaa-0000-0000-0000-000000000002', 'Auchi school visit',
  (select id from public.chapters where name='Auchi'), 'Pending', 25, null),
 ('aaaaaaaa-0000-0000-0000-000000000003', 'Benin follow-up',
  (select id from public.chapters where name='Benin'), 'Pending', 30,
  '33333333-3333-3333-3333-333333333333');

insert into public.pending_signups (id, email, full_name)
values ('66666666-6666-6666-6666-666666666666', 'waiting@ycdi.test', 'Uche Waiting');
