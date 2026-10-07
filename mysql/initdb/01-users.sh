#!/bin/bash

set -euo pipefail

test_db="${MYSQL_DATABASE}_test"
app_db_grant="${MYSQL_DATABASE//_/\\_}"
test_db_grant="${test_db//_/\\_}"

MYSQL_PWD="${MYSQL_ROOT_PASSWORD}" mysql --protocol=socket -uroot <<SQL
CREATE DATABASE IF NOT EXISTS \`${test_db}\`;

CREATE USER IF NOT EXISTS '${APP_DB_USER}'@'%' IDENTIFIED BY '${APP_DB_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${app_db_grant}\`.* TO '${APP_DB_USER}'@'%';

CREATE USER IF NOT EXISTS '${MIGRATOR_DB_USER}'@'%' IDENTIFIED BY '${MIGRATOR_DB_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES,
      CREATE VIEW, SHOW VIEW, TRIGGER, LOCK TABLES
   ON \`${app_db_grant}\`.* TO '${MIGRATOR_DB_USER}'@'%';
GRANT ALL PRIVILEGES ON \`${test_db_grant}\`.* TO '${MIGRATOR_DB_USER}'@'%';
SQL
echo "initdb: created users '${APP_DB_USER}' and '${MIGRATOR_DB_USER}', database '${test_db}'."
