SELECT 'CREATE DATABASE resumeai_test OWNER resumeai'
WHERE NOT EXISTS (
	SELECT 1
	FROM pg_database
	WHERE datname = 'resumeai_test'
)
\gexec
