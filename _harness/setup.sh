#!/bin/bash
set -e
export PATH=/usr/lib/postgresql/16/bin:$PATH
mkdir -p /tmp/pg /var/lib/postgresql/data
chown -R postgres /tmp/pg /var/lib/postgresql/data
if [ ! -f /var/lib/postgresql/data/PG_VERSION ]; then
  su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; initdb -D /var/lib/postgresql/data" >/dev/null
fi
su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; pg_ctl -D /var/lib/postgresql/data -o '-k /tmp/pg -h \"\"' -l /tmp/pg.log start" >/dev/null 2>&1 || true
sleep 3
su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d postgres -c 'drop database if exists ycdi;'" >/dev/null
su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d postgres -c 'create database ycdi;'" >/dev/null
R=/home/claude/hub
for f in _harness/00-supabase-mock.sql \
         _harness/20-net-vault-mock.sql \
         ycdi-final-db-setup.sql \
         stage1-prayer-schedule-notes.sql \
         stage2-calendar-announcements.sql \
         stage3-documents.sql \
         admin-access-and-directory-sync.sql \
         fix-team-member-and-photo-permissions.sql \
         fix-manage-admins-list.sql \
         signup-fields-and-private-phones.sql \
         stage4-messaging.sql \
         batch0-crash-log-and-check.sql \
         batch0b-lock-down-legacy-tables.sql \
         ${EXTRA:-} \
         _harness/10-seed.sql ; do
  [ -z "$f" ] && continue
  out=$(su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH; psql -h /tmp/pg -d ycdi -v ON_ERROR_STOP=1 -q -f $R/$f" 2>&1) || { echo "FAILED: $f"; echo "$out" | tail -20; exit 1; }
done
echo "loaded ok"
