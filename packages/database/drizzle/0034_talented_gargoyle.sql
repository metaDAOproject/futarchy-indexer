DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_order_tx_sig_transactions_tx_sig_fk" FOREIGN KEY ("order_tx_sig") REFERENCES "transactions"("tx_sig") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
