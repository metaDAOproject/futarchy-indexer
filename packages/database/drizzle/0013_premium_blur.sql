ALTER TABLE "proposal_details" ALTER COLUMN "proposal_acct" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "program_name" varchar NOT NULL;