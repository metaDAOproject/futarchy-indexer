CREATE TABLE IF NOT EXISTS "launch_details" (
	"launch_addr" varchar(44) NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"image_url" text,
	"video_url" text,
	"website_url" text,
	"twitter_url" text,
	"telegram_url" text,
	"discord_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "launch_details" ADD CONSTRAINT "launch_details_launch_addr_v0_4_launches_launch_addr_fk" FOREIGN KEY ("launch_addr") REFERENCES "public"."v0_4_launches"("launch_addr") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
