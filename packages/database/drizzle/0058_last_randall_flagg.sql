ALTER TABLE "dao_details" ADD COLUMN "socials" jsonb;

-- This will transfer data from x_account and github columns to new format and into the socials column
UPDATE "dao_details" SET socials = format('[{"id": "x", "value": "%s"},{"id": "github", "value": "%s"}]', x_account, github)::jsonb;