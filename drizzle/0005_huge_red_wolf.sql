ALTER TABLE "users" ADD COLUMN "sessions_revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "room_creation_window_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "room_creation_count" integer DEFAULT 0 NOT NULL;