# _harness/mutate-batch36.py                     BATCH36-MARKER mutants
#
# usage:  mutate-batch36.py list
#         mutate-batch36.py <mutant> <batch36-scale-and-search.sql> <out.sql>
#
# Each mutant removes or weakens exactly one clause of the Batch 36 read
# rule, stage_summary() or quiet_participants(). run-batch36-tests.sh
# expects every one of them to change what at least one test user sees.
# A mutant that changes nothing means either the clause is dead or the
# test data cannot tell the difference, and both need fixing.
import sys

M = {
 'P1-admin':    ('pol', "(select public.is_admin())\n    or ", ""),
 'P2-nc':       ('pol', "or (select public.dir_role()) = 'NC'\n", ""),
 'P3-pd':       ('pol', "or (select public.holds_portfolio('PD'))\n", ""),
 'P4-rc-chap':  ('pol', "= 'RC' and chapter_id = (select public.dir_chapter()))", "= 'RC')"),
 'P5-tm-chap':  ('pol', "      chapter_id = (select public.dir_chapter())\n      and (", "      true\n      and ("),
 'P6-tm-made':  ('pol', "created_by = (select auth.uid())\n        or ", ""),
 'P7-tm-ment':  ('pol', "\n        or id in (select public.my_mentee_ids())", ""),
 'S1-admin':    ('sum', "(me.admin or ", "(false or "),
 'S2-nc':       ('sum', "or me.role = 'NC' ", ""),
 'S3-pd':       ('sum', "or me.pd\n", "\n"),
 'S4-rc-chap':  ('sum', "(me.role = 'RC' and p.chapter_id = me.chapter)", "(me.role = 'RC')"),
 'S5-filter':   ('sum', "and (p_chapter is null or p.chapter_id = p_chapter)", ""),
 'S6-active':   ('sum', "where p.active\n", "where true\n"),
 'Q1-admin':    ('qui', "me.admin or me.role = 'NC'", "me.role = 'NC'"),
 'Q2-rc-chap':  ('qui', "(me.role = 'RC' and p.chapter_id = me.chapter)", "(me.role = 'RC')"),
 'Q3-tm-chap':  ('qui', "or (p.chapter_id = me.chapter\n", "or (true\n"),
 'Q4-tm-made':  ('qui', "(p.created_by = me.uid or ", "(false or "),
 'Q5-tm-ment':  ('qui', " or p.id in (select id from mine))", ")"),
 'Q6-stages':   ('qui', "from public.participant_stages s where", "from public.participant_stages s where false and"),
 'Q7-attend':   ('qui', "from public.participant_attendance a where", "from public.participant_attendance a where false and"),
 'Q8-touch':    ('qui', "from public.participant_touchpoints t where", "from public.participant_touchpoints t where false and"),
 'Q9-days':     ('qui', "make_interval(days => p_days)", "make_interval(days => 21)"),
 'Q10-active':  ('qui', "where p.active\n", "where true\n"),
 'Q11-mentor':  ('qui', "on m.participant_id = s.id and m.ended_on is null", "on m.participant_id = s.id"),
}

def regions(src):
    pol_s = src.index('create policy pt_read');                              pol_e = src.index(');', pol_s)
    sum_s = src.index('create or replace function public.stage_summary');    sum_e = src.index('$$;', sum_s)
    qui_s = src.index('create or replace function public.quiet_participants'); qui_e = src.index('$$;', qui_s)
    return {'pol': (pol_s, pol_e), 'sum': (sum_s, sum_e), 'qui': (qui_s, qui_e)}

if sys.argv[1] == 'list':
    print(' '.join(M)); sys.exit(0)

name, src_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
region, old, new = M[name]
src = open(src_path).read()
a, b = regions(src)[region]
seg = src[a:b]
if seg.count(old) != 1:
    print(f"BADMUTANT {name}: pattern matched {seg.count(old)} times"); sys.exit(2)
open(out_path, 'w').write(src[:a] + seg.replace(old, new) + src[b:])
