CREATE TABLE "desktop_auth_grants" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"state_hash" text NOT NULL,
	"code_challenge" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "desktop_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "desktop_auth_grants" ADD CONSTRAINT "desktop_auth_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desktop_sessions" ADD CONSTRAINT "desktop_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "desktop_auth_grants_expires_at_idx" ON "desktop_auth_grants" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "desktop_sessions_token_hash_unique" ON "desktop_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "desktop_sessions_user_id_idx" ON "desktop_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "desktop_sessions_expires_at_idx" ON "desktop_sessions" USING btree ("expires_at");