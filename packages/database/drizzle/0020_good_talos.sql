ALTER TABLE "indexers" ADD COLUMN "indexer_type" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction_watchers" ADD COLUMN "status" varchar NOT NULL;