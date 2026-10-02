ALTER TABLE "rooms" ADD COLUMN "last_active_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "rooms" SET "expires_at" = "last_active_at" + interval '3 days' WHERE "expires_at" IS NULL;--> statement-breakpoint
ALTER TABLE "rooms" ALTER COLUMN "expires_at" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "rooms_expiration_idx" ON "rooms" USING btree ("expires_at");
