-- _harness/batch36-seed.sql                      BATCH36-MARKER seed
-- 30,000 participants plus the mentoring, activity, inactive and seat data
-- the Batch 36 equivalence and mutation tests need. Test database only.

insert into public.participants (chapter_id, full_name, gender, age_band, class_level, school, stage, consent_on, created_by)
select (select id from public.chapters where name = (array['Benin','Auchi','Ondo','Osun','Lagos'])[1 + g % 5]),
  (array['Adebayo','Chioma','Emeka','Funmilayo','Ifeanyi','Ngozi','Oluwaseun','Tunde','Amaka','Babatunde','Chinedu','Damilola','Efosa','Osaro','Ivie','Uyi','Kehinde','Taiwo','Nneka','Obinna'])[1 + g % 20]
   || ' ' || (array['Okafor','Adeyemi','Eze','Osagie','Igbinedion','Balogun','Nwosu','Ogunleye','Aigbe','Ehigiator','Okonkwo','Afolabi','Uwaifo','Obaseki','Adewale'])[1 + (g / 20) % 15] || ' ' || g,
  (array['Male','Female'])[1 + g % 2],
  (array['13-15','16-17','18+','10-12'])[1 + g % 4],
  (array['JSS1','JSS2','JSS3','SS1','SS2','SS3','100L','200L'])[1 + g % 8],
  (array['Edo College','Immaculate Conception College','Anglican Girls Grammar School','Auchi Polytechnic','Ondo High School','Osun State University','Kings College','Queens College','Uniben'])[1 + g % 9] || ' ' || (g % 40),
  (array['Contact','Connect','Commit','Grow','Multiply'])[1 + g % 5],
  current_date - (g % 700),
  '33333333-3333-3333-3333-333333333333'
from generate_series(1, 30000) g;
analyze public.participants; analyze public.participant_stages;

-- half the young people have gone quiet
update public.participant_stages set moved_on = current_date - 60 where participant_id in (select id from public.participants where (hashtext(id::text) & 1) = 0);
-- the Benin team member mentors 40 people and added 25 others
insert into public.participant_mentors (participant_id, mentor_id, assigned_on)
select id, '44444444-4444-4444-4444-444444444444', current_date - 30 from public.participants
where chapter_id = (select id from public.chapters where name='Benin') and id not in (select participant_id from public.participant_mentors where ended_on is null)
order by full_name limit 40;
update public.participants set created_by = '44444444-4444-4444-4444-444444444444'
where id in (select id from public.participants where chapter_id = (select id from public.chapters where name='Benin') order by full_name desc limit 25);
-- a TM-owned record in another chapter must stay invisible to them
update public.participants set created_by = '44444444-4444-4444-4444-444444444444'
where id in (select id from public.participants where chapter_id = (select id from public.chapters where name='Lagos') order by full_name limit 3);
analyze;

insert into auth.users (id) values ('77777777-7777-7777-7777-777777777777') on conflict do nothing;
insert into public.profiles (id, full_name, role, chapter_id) values ('77777777-7777-7777-7777-777777777777','Pat PD','TM',(select id from public.chapters where name='Lagos')) on conflict do nothing;
insert into auth.users (id) values ('99999999-9999-9999-9999-999999999999') on conflict do nothing;
insert into public.profiles (id, full_name, role, chapter_id) values ('99999999-9999-9999-9999-999999999999','Lola Lagos TM','TM',(select id from public.chapters where name='Lagos')) on conflict do nothing;
insert into public.nec_portfolios (portfolio, profile_id) values ('PD', '77777777-7777-7777-7777-777777777777')
on conflict (portfolio) do update set profile_id = excluded.profile_id;
insert into public.participant_touchpoints (participant_id, mentor_id, occurred_on, kind, note)
select participant_id, mentor_id, current_date - 2, 'conversation', 'bench' from public.participant_mentors where mentor_id = '44444444-4444-4444-4444-444444444444' limit 10;
analyze;
insert into auth.users (id) values ('88888888-8888-8888-8888-888888888888') on conflict do nothing;
insert into public.profiles (id, full_name, role, chapter_id, is_admin) values ('88888888-8888-8888-8888-888888888888','Sam Admin','TM',(select id from public.chapters where name='Ondo'), true) on conflict (id) do update set is_admin = true;
-- 60 quiet Benin people attended a programme last week: only attendance keeps them off the quiet list
insert into public.participant_attendance (participant_id, program_id, attended_on)
select p.id, 'aaaaaaaa-0000-0000-0000-000000000001', current_date - 5
from public.participants p
where p.chapter_id = (select id from public.chapters where name='Benin') and (hashtext(p.id::text) & 1) = 0
order by p.id limit 60 on conflict do nothing;
-- touchpoints also on quiet-by-stage people, so the touchpoint source matters on its own
insert into public.participant_touchpoints (participant_id, mentor_id, occurred_on, kind)
select p.id, '44444444-4444-4444-4444-444444444444', current_date - 3, 'visit'
from public.participants p
where p.chapter_id = (select id from public.chapters where name='Benin') and (hashtext(p.id::text) & 1) = 0
  and p.id not in (select participant_id from public.participant_attendance)
order by p.id desc limit 30;
analyze;
-- 200 inactive people across chapters (some quiet, some not)
update public.participants set active = false where id in (select id from public.participants order by md5(id::text) limit 200);
-- activity 10 days ago: quiet at 7 days, not at 21
insert into public.participant_attendance (participant_id, program_id, attended_on)
select p.id, 'aaaaaaaa-0000-0000-0000-000000000003', current_date - 10
from public.participants p
where p.chapter_id = (select id from public.chapters where name='Benin') and (hashtext(p.id::text) & 1) = 0
  and p.id not in (select participant_id from public.participant_attendance)
order by md5(p.id::text) limit 40 on conflict do nothing;
-- ended mentorships on quiet people: must not appear as their mentor
insert into public.participant_mentors (participant_id, mentor_id, assigned_on, ended_on)
select p.id, '33333333-3333-3333-3333-333333333333', current_date - 200, current_date - 100
from public.participants p
where p.chapter_id = (select id from public.chapters where name='Benin') and (hashtext(p.id::text) & 1) = 0
order by md5(p.id::text) desc limit 50;
analyze;
