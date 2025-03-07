ALTER TABLE "v0_4_funding_records" ADD COLUMN "updated_at_slot" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "v0_4_launches" ADD COLUMN "updated_at_slot" bigint DEFAULT 0 NOT NULL;