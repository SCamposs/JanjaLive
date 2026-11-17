CREATE TABLE "discord_guild_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"blocked" boolean NOT NULL,
	"changed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_guilds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"changed_at" timestamp with time zone,
	"sync_pending" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discord_guild_audit_log" ADD CONSTRAINT "discord_guild_audit_log_guild_id_discord_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."discord_guilds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_guild_audit_log" ADD CONSTRAINT "discord_guild_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discord_guild_audit_idx" ON "discord_guild_audit_log" USING btree ("guild_id","changed_at");--> statement-breakpoint
CREATE INDEX "discord_guilds_seen_idx" ON "discord_guilds" USING btree ("last_seen_at","id");