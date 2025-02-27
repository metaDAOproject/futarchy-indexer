ALTER TABLE "v0_4_funding_records" ADD COLUMN "latest_funding_record_seq_num_applied" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "v0_4_funding_records" ADD COLUMN "is_claimed" boolean NOT NULL;--> statement-breakpoint
ALTER TABLE "v0_4_funding_records" ADD COLUMN "is_refunded" boolean NOT NULL;