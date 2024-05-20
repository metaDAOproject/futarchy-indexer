CREATE TABLE IF NOT EXISTS "token_acct_balances" (
	"token_acct" varchar(44) NOT NULL,
	"mint_acct" varchar(44) NOT NULL,
	"owner_acct" varchar(44) NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "token_acct_balances_token_acct_mint_acct_amount_created_at_pk" PRIMARY KEY("token_acct","mint_acct","amount","created_at")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acct_amount_created" ON "token_acct_balances" ("token_acct","created_at","amount");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "token_acct_balances" ADD CONSTRAINT "token_acct_balances_token_acct_token_accts_token_acct_fk" FOREIGN KEY ("token_acct") REFERENCES "token_accts"("token_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "token_acct_balances" ADD CONSTRAINT "token_acct_balances_mint_acct_tokens_mint_acct_fk" FOREIGN KEY ("mint_acct") REFERENCES "tokens"("mint_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
