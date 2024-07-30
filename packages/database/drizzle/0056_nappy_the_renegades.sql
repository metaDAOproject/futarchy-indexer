DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_actor_acct_users_user_acct_fk" FOREIGN KEY ("actor_acct") REFERENCES "users"("user_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
