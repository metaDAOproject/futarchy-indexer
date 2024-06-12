CREATE OR REPLACE FUNCTION notify_transactions_insert() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('transactions_insert_channel', json_build_object(
      'tx_sig', NEW.tx_sig
    )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notify_transactions_insert_trigger
AFTER INSERT ON transactions
FOR EACH ROW EXECUTE FUNCTION notify_transactions_insert();