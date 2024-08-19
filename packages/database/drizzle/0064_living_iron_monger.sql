ALTER TABLE "user_performance" ADD COLUMN "dao_acct" varchar(44);--> statement-breakpoint
ALTER TABLE "user_performance" ADD COLUMN "total_volume" numeric(40, 20) DEFAULT '0.0' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_performance" ADD COLUMN "tokens_bought_resolving_market" numeric(40, 20) DEFAULT '0.0' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_performance" ADD COLUMN "tokens_sold_resolving_market" numeric(40, 20) DEFAULT '0.0' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_performance" ADD COLUMN "volume_bought_resolving_market" numeric(40, 20) DEFAULT '0.0' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_performance" ADD COLUMN "volume_sold_resolving_market" numeric(40, 20) DEFAULT '0.0' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_performance" ADD COLUMN "buy_orders_count" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_performance" ADD COLUMN "sell_orders_count" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
-- ALTER TABLE "user_performance" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_performance" ADD CONSTRAINT "user_performance_dao_acct_daos_dao_acct_fk" FOREIGN KEY ("dao_acct") REFERENCES "daos"("dao_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
