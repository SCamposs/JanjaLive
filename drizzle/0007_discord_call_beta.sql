CREATE TABLE "discord_call_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"interaction_id" text NOT NULL,
	"discord_user_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"room_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "discord_call_intents_interaction_id_unique" UNIQUE("interaction_id")
);
--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "discord_guild_id" text;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "discord_channel_id" text;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "discord_message_id" text;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "discord_card_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "discord_session_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discord_call_intents" ADD CONSTRAINT "discord_call_intents_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discord_call_intents_expiry_idx" ON "discord_call_intents" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_active_discord_channel_unique" ON "rooms" USING btree ("discord_guild_id","discord_channel_id") WHERE "rooms"."closed_at" is null and "rooms"."discord_guild_id" is not null;