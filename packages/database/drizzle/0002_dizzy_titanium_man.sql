ALTER TABLE "v0_4_metric_decisions" ADD COLUMN "recipient" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "v0_4_metric_decisions" ADD COLUMN "market_opened" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "v0_4_metric_decisions" ADD COLUMN "grant_awarded" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "v0_4_metric_decisions" ADD COLUMN "committee_evaluation" timestamp with time zone DEFAULT now() NOT NULL;