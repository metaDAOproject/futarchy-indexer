CREATE TABLE IF NOT EXISTS "proposal_details" (
	"proposal_id" bigint PRIMARY KEY NOT NULL,
	"proposal_acct" varchar(44) NOT NULL,
	"title" varchar,
	"description" varchar,
	"categories" jsonb,
	"content" text
);
--> statement-breakpoint
ALTER TABLE "daos" DROP CONSTRAINT "dao_program";--> statement-breakpoint
ALTER TABLE "proposals" DROP CONSTRAINT "unique_proposal_acct";--> statement-breakpoint
ALTER TABLE "daos" ALTER COLUMN "dao_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" DROP COLUMN IF EXISTS "title";--> statement-breakpoint
ALTER TABLE "proposals" DROP COLUMN IF EXISTS "description";--> statement-breakpoint
ALTER TABLE "proposals" DROP COLUMN IF EXISTS "categories";--> statement-breakpoint
ALTER TABLE "proposals" DROP COLUMN IF EXISTS "content";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "proposal_details" ADD CONSTRAINT "proposal_details_proposal_acct_proposals_proposal_acct_fk" FOREIGN KEY ("proposal_acct") REFERENCES "proposals"("proposal_acct") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "daos" ADD CONSTRAINT "dao_acct_program" UNIQUE("dao_acct","program_acct");