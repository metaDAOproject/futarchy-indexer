ALTER TABLE "daos" ADD COLUMN "slots_per_proposal" bigint;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "end_slot" bigint;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "ended_at" timestamp;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "completed_at" timestamp;