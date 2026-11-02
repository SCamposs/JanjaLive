CREATE TABLE "turn_credentials" (
	"username" text PRIMARY KEY NOT NULL,
	"key_id" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "turn_credentials" ADD CONSTRAINT "turn_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "turn_credentials_user_expiry_idx" ON "turn_credentials" USING btree ("user_id","expires_at");