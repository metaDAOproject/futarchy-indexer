CREATE TABLE IF NOT EXISTS "comments" (
	"comment_id" bigint PRIMARY KEY NOT NULL,
	"commentor_acct" varchar(44) NOT NULL,
	"proposal_acct" varchar(44) NOT NULL,
	"content" text NOT NULL,
	"responding_comment_id" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "comments_comment_id_unique" UNIQUE("comment_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reactions" (
	"reactor_acct" varchar(44) NOT NULL,
	"comment_id" bigint,
	"proposal_acct" varchar(44),
	"reaction" varchar NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "reactions_proposal_acct_reaction_reactor_acct_pk" PRIMARY KEY("proposal_acct","reaction","reactor_acct")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"user_acct" varchar(44) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_user" UNIQUE("user_acct")
);
--> statement-breakpoint
ALTER TABLE "proposals" RENAME COLUMN "outcome" TO "status";--> statement-breakpoint
DROP INDEX IF EXISTS "slot_index";--> statement-breakpoint
ALTER TABLE "candles" DROP CONSTRAINT "candles_market_acct_candle_duration_timestamp";--> statement-breakpoint
ALTER TABLE "indexer_account_dependencies" DROP CONSTRAINT "indexer_account_dependencies_name_acct";--> statement-breakpoint
ALTER TABLE "transaction_watcher_transactions" DROP CONSTRAINT "transaction_watcher_transactions_watcher_acct_tx_sig";--> statement-breakpoint
ALTER TABLE "twaps" DROP CONSTRAINT "twaps_market_acct_updated_slot";--> statement-breakpoint
ALTER TABLE "daos" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "daos" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "candles" ADD CONSTRAINT "candles_market_acct_candle_duration_timestamp_pk" PRIMARY KEY("market_acct","candle_duration","timestamp");--> statement-breakpoint
ALTER TABLE "indexer_account_dependencies" ADD CONSTRAINT "indexer_account_dependencies_name_acct_pk" PRIMARY KEY("name","acct");--> statement-breakpoint
ALTER TABLE "transaction_watcher_transactions" ADD CONSTRAINT "transaction_watcher_transactions_watcher_acct_tx_sig_pk" PRIMARY KEY("watcher_acct","tx_sig");--> statement-breakpoint
ALTER TABLE "twaps" ADD CONSTRAINT "twaps_market_acct_updated_slot_pk" PRIMARY KEY("market_acct","updated_slot");--> statement-breakpoint
ALTER TABLE "daos" ADD COLUMN "x_account" varchar;--> statement-breakpoint
ALTER TABLE "daos" ADD COLUMN "github" varchar;--> statement-breakpoint
ALTER TABLE "daos" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "daos" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "daos" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "title" varchar;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "description" varchar;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "categories" jsonb;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "content" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watcher_slot_index" ON "transaction_watcher_transactions" ("watcher_acct","slot");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "txn_slot_index" ON "transactions" ("slot");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comments" ADD CONSTRAINT "comments_proposal_acct_proposals_proposal_acct_fk" FOREIGN KEY ("proposal_acct") REFERENCES "proposals"("proposal_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comments" ADD CONSTRAINT "comments_responding_comment_id_comments_comment_id_fk" FOREIGN KEY ("responding_comment_id") REFERENCES "comments"("comment_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reactions" ADD CONSTRAINT "reactions_comment_id_comments_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "comments"("comment_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reactions" ADD CONSTRAINT "reactions_proposal_acct_proposals_proposal_acct_fk" FOREIGN KEY ("proposal_acct") REFERENCES "proposals"("proposal_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "unique_proposal_acct" UNIQUE("proposal_acct");