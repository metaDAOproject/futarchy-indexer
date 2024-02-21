ALTER TABLE "proposals" ADD COLUMN "proposer_acct" varchar(44) NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "outcome" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "description_url" varchar;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "updated_at" timestamp NOT NULL;