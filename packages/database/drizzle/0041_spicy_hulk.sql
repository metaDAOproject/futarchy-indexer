ALTER TABLE "v0_4_proposals" ADD COLUMN "finalized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "v0_4_proposals" ADD COLUMN "duration_in_slots" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "v0_4_proposals" ADD COLUMN "updated_at_slot" bigint DEFAULT 0 NOT NULL;