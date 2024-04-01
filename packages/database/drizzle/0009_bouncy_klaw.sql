CREATE TABLE IF NOT EXISTS "daos" (
	"dao_acct" varchar(44) PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"url" varchar NOT NULL,
	"mint_acct" varchar(44) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "dao_acct" varchar(44) NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposals" ADD CONSTRAINT "proposals_dao_acct_daos_dao_acct_fk" FOREIGN KEY ("dao_acct") REFERENCES "daos"("dao_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daos" ADD CONSTRAINT "daos_mint_acct_tokens_mint_acct_fk" FOREIGN KEY ("mint_acct") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
