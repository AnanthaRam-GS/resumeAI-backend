#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_SCRIPT="${SCRIPT_DIR}/setup-local-postgres.sql"
SETUP_DATABASE_URL="${POSTGRES_SETUP_URL:-postgresql://localhost:5432/postgres}"

DEV_DATABASE_URL="postgresql://resumeai:resumeai_password@localhost:5432/resumeai_dev"
TEST_DATABASE_URL="postgresql://resumeai:resumeai_password@localhost:5432/resumeai_test"
export PGHOST="localhost"
export PGPORT="5432"

redact_database_url() {
	local url="${1%%\?*}"

	if [[ "${url}" == *"://"* && "${url}" == *@* ]]; then
		local scheme="${url%%://*}://"
		local remainder="${url#*://}"
		local host_and_path="${remainder#*@}"
		printf '%s<redacted>@%s\n' "${scheme}" "${host_and_path}"
		return
	fi

	printf '%s\n' "${url}"
}

if ! command -v psql >/dev/null 2>&1; then
	echo "psql is not installed or not available on PATH."
	echo "Install PostgreSQL 15.x with Homebrew before running this script."
	exit 1
fi

echo "Detected PostgreSQL client:"
psql --version

if command -v brew >/dev/null 2>&1; then
	if brew list --formula | grep -qx 'postgresql@15'; then
		echo "Starting Homebrew PostgreSQL service: postgresql@15"
		brew services start postgresql@15 >/dev/null 2>&1 || true
	elif brew list --formula | grep -qx 'postgresql'; then
		echo "Starting Homebrew PostgreSQL service: postgresql"
		brew services start postgresql >/dev/null 2>&1 || true
	else
		echo "Homebrew PostgreSQL formula was not found. Ensure the server is already running."
	fi
else
	echo "Homebrew was not found. Ensure PostgreSQL is already running on localhost:5432."
fi

echo "Applying local PostgreSQL setup from ${SQL_SCRIPT}"
echo "Setup connection target: $(redact_database_url "${SETUP_DATABASE_URL}")"
psql "${SETUP_DATABASE_URL}" -f "${SQL_SCRIPT}"

cat <<EOF

Local PostgreSQL setup complete.

Use these values in .env:
DATABASE_URL=${DEV_DATABASE_URL}
TEST_DATABASE_URL=${TEST_DATABASE_URL}

Use this value in .env.test:
DATABASE_URL=${TEST_DATABASE_URL}

If your local PostgreSQL superuser requires credentials, rerun with:
POSTGRES_SETUP_URL=postgresql://<admin-user>:<admin-password>@localhost:5432/postgres pnpm db:local:setup
EOF
