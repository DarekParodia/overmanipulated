#!/usr/bin/env bash
# Consistent backup of the game database from the running stack, with simple retention.
#   tools/deploy/backup.sh [backup-dir] [keep-days]      (defaults: ./backups, 14)
# Run from the repository root on the VPS, e.g. from cron:
#   17 3 * * *  cd /srv/redakcja && tools/deploy/backup.sh >> backups/backup.log 2>&1
# `VACUUM INTO` makes a consistent copy even while the server writes (WAL mode). The copy is
# made and integrity-checked inside the container, then copied out and removed there.
# Restore: see docs/deploy.md.
set -euo pipefail

dir="${1:-./backups}"
keep_days="${2:-14}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$dir"

docker compose exec -T server bun -e "
  import { Database } from 'bun:sqlite';
  import { rmSync } from 'node:fs';
  const copy = '/tmp/backup.sqlite';
  rmSync(copy, { force: true });
  const source = new Database('/data/redakcja.sqlite', { readonly: true });
  source.run(\"VACUUM INTO '\" + copy + \"'\");
  source.close();
  const check = new Database(copy, { readonly: true });
  const result = check.query('PRAGMA integrity_check').get();
  check.close();
  if (result?.integrity_check !== 'ok') {
    console.error('backup failed the integrity check');
    process.exit(1);
  }
"
docker compose cp server:/tmp/backup.sqlite "$dir/redakcja-$stamp.sqlite"
docker compose exec -T server rm -f /tmp/backup.sqlite

find "$dir" -name 'redakcja-*.sqlite' -mtime "+$keep_days" -delete
echo "backup written: $dir/redakcja-$stamp.sqlite (files older than $keep_days days removed)"
