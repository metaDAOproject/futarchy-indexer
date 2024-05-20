CREATE TABLE IF NOT EXISTS "prices" (
	"market_acct" varchar(44) NOT NULL,
	"updated_slot" bigint NOT NULL,
	"base_amount" bigint,
	"quote_amount" bigint,
	"price" numeric(20, 0) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "prices_updated_slot_market_acct_pk" PRIMARY KEY("updated_slot","market_acct")
);
--> statement-breakpoint
ALTER TABLE "twaps" ADD COLUMN "last_observation" numeric(40, 0);--> statement-breakpoint
ALTER TABLE "twaps" ADD COLUMN "last_price" numeric(40, 0);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prices" ADD CONSTRAINT "prices_market_acct_markets_market_acct_fk" FOREIGN KEY ("market_acct") REFERENCES "markets"("market_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
