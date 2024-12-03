TODO

[] Insert conditional prices when new proposal is indexed
[] Manage database connections better - probably a connection pool with dedicated channels for each major component
[] Add telemetry - probably log calltrace when indexer crashes
[] Add logging for db connections and health checks
[] Unify v3 and v4 indexers to both either use croner or regular intervals (currently v3 uses cron and v4 uses regular intervals)