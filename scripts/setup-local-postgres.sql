\set ON_ERROR_STOP on

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resumeai') THEN
		CREATE ROLE resumeai LOGIN PASSWORD 'resumeai_password';
	ELSE
		ALTER ROLE resumeai WITH LOGIN PASSWORD 'resumeai_password';
		ALTER ROLE resumeai WITH LOGIN;
	END IF;
END
$$;

SELECT 'CREATE DATABASE resumeai_dev OWNER resumeai'
WHERE NOT EXISTS (
	SELECT 1
	FROM pg_database
	WHERE datname = 'resumeai_dev'
)
\gexec

SELECT 'CREATE DATABASE resumeai_test OWNER resumeai'
WHERE NOT EXISTS (
	SELECT 1
	FROM pg_database
	WHERE datname = 'resumeai_test'
)
\gexec

GRANT ALL PRIVILEGES ON DATABASE resumeai_dev TO resumeai;
GRANT ALL PRIVILEGES ON DATABASE resumeai_test TO resumeai;

SELECT 'ALTER DATABASE resumeai_dev OWNER TO resumeai'
WHERE EXISTS (
	SELECT 1
	FROM pg_database
	WHERE datname = 'resumeai_dev'
)
\gexec

SELECT 'ALTER DATABASE resumeai_test OWNER TO resumeai'
WHERE EXISTS (
	SELECT 1
	FROM pg_database
	WHERE datname = 'resumeai_test'
)
\gexec

\connect resumeai_dev
GRANT ALL ON SCHEMA public TO resumeai;
ALTER SCHEMA public OWNER TO resumeai;

\connect resumeai_test
GRANT ALL ON SCHEMA public TO resumeai;
ALTER SCHEMA public OWNER TO resumeai;
