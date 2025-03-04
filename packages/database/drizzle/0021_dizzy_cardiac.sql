ALTER TABLE "proposal_details" ADD COLUMN "state" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "v0_4_metric_decisions" ADD COLUMN "state" text DEFAULT 'draft' NOT NULL;