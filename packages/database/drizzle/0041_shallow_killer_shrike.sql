ALTER TABLE "token_accts" ALTER COLUMN "updated_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "indexer_account_dependencies" ADD COLUMN "status" varchar;--> statement-breakpoint
ALTER TABLE "indexer_account_dependencies" ADD COLUMN "updated_at" timestamp;