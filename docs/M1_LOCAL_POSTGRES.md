# M1 local PostgreSQL verification environment

The M1 session downloaded `@embedded-postgres/windows-x64@16.14.0-beta.17` from npm
and extracted it under `.local-postgres/package`. This is PostgreSQL 16.14 binary distribution
for development verification only, not a production deployment choice.
The ignored directory also contains the test data cluster and an isolated fresh-install copy.
No Windows service was installed. Keep all connections on loopback.

To reuse the existing local cluster from PowerShell at repository root:

```powershell
& '.local-postgres/package/native/bin/pg_ctl.exe' -D 'E:/WebstiteCMS/.local-postgres/data' -l 'E:/WebstiteCMS/.local-postgres/server.log' -o '-h 127.0.0.1 -p 55432' -w start
$env:DATABASE_URL = 'postgresql://platform@127.0.0.1:55432/m1_root_test'
pnpm dev
```

This cluster uses trust authentication on localhost for temporary verification only.
`m1_root_test` contains the seeded development site and can be used for local exploration.
Do not use it as TEST_DATABASE_URL for the clean migration test again: create a new dedicated database for each test run.
For normal setup on another machine follow Docker/PostgreSQL instructions in README instead.

Stop the local cluster when finished:

```powershell
& '.local-postgres/package/native/bin/pg_ctl.exe' -D 'E:/WebstiteCMS/.local-postgres/data' -m fast -w stop
```

No data cleanup is automatic. The portable cluster and fresh-install copy are retained for reproducibility.
