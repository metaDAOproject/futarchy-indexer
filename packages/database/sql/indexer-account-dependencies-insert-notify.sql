CREATE OR REPLACE FUNCTION notify_indexer_account_dependencies_insert() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('indexer_account_dependencies_insert_channel', json_build_object(
      'name', NEW.name,
      'acct', NEW.acct
    )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notify_indexer_account_dependencies_insert_trigger
AFTER INSERT ON indexer_account_dependencies
FOR EACH ROW EXECUTE FUNCTION notify_indexer_account_dependencies_insert();