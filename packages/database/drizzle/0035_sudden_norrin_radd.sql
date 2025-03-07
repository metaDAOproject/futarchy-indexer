ALTER TABLE "v0_4_launches" RENAME COLUMN "creator" TO "launch_authority";--> statement-breakpoint
ALTER TABLE "v0_4_launches" ADD COLUMN "unix_timestamp_started" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "v0_4_launches" ADD COLUMN "seconds_for_launch" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "v0_4_launches" DROP COLUMN IF EXISTS "slot_started";