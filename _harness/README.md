# Database test harness

Nothing here ships to the live site. Vite only builds what's in `src/`,
so these files are ignored by the build and cost you nothing.

This exists because the permission rules are the part of the hub that
can't be checked by looking at the screen. A rule that's too loose looks
exactly like a rule that's correct, right up until somebody finds it.

What it does: stands up a throwaway Postgres database that imitates the
live Supabase setup, including the older rules that were already there,
then replays every SQL script this project has ever shipped in order,
then tries to break the result.

The attacks it runs include a team member promoting themselves to admin,
a coordinator approving their own programme, someone signing up and
creating their own approved account, a team member reading another
chapter's private channel, and the last remaining admin removing their
own access. Every one of them has to be refused, and the run fails if any
of them isn't.

## Files

- `00-supabase-mock.sql` — stand-in for the parts of Supabase the
  scripts rely on: the `auth` and `storage` schemas, the `authenticated`
  role, and the tables and rules that existed before this work started.
- `10-seed.sql` — four accounts, one of each kind, plus programmes and a
  waiting sign-up request.
- `run-security-tests.sh` — the attacks, with the expected outcome for
  each.

## Running it

Needs Postgres 16 locally. Create a database, load the mock, run every
`.sql` file in the project root in the order they were shipped, load the
seed, then run the shell script.

One thing worth knowing if you ever read the output: row security hides
rows rather than refusing outright, so an update that changes nothing
looks like success. The runner treats "changed nothing" as a refusal for
exactly that reason.
