# Single-owner operations

JanjaLive has one operational owner, not a role system. The production identity is the conjunction of:

- JanjaLive user ID `50864623-b2c2-49b1-8162-0be7adb3a4cd`
- Discord user ID `325447679368757249`

Both values must match the authenticated database records. A username, display name, hidden link, or knowledge of `/admin` never grants access.

The web header renders a small shield shortcut only after this server-side check succeeds. Ordinary users do not receive the shortcut markup. The desktop app intentionally has no embedded administration surface.

## Deployment variables

Configure these as encrypted server-side variables in Vercel Production (and only in Preview when deliberately testing the panel):

```text
ADMIN_USER_ID=50864623-b2c2-49b1-8162-0be7adb3a4cd
ADMIN_DISCORD_USER_ID=325447679368757249
```

Do not prefix either variable with `NEXT_PUBLIC_`. They are not needed in Cloudflare or in the desktop build.

## Deployment order

1. Deploy the realtime Worker first. It accepts both `janjalive-v1` and `janjalive-v2`, adds an internal compatibility session for released clients, translates replies back to the active v2 session, and removes the new field before sending a message to a strict v1 recipient.
2. Deploy the Vercel application. Its normal `prebuild` applies the checked-in Drizzle migration before the Next.js build.
3. Confirm the owner sees the shield shortcut and `/admin`; confirm an ordinary account receives the same 404 as an unauthenticated request.
4. Complete the manual recovery and interoperability checklist before publishing the next desktop release.
5. Publish the desktop update only after the soak and native-audio checks pass.

## Ban behavior

A ban changes the PostgreSQL account state, writes one minimal `BAN` audit record, deletes active Auth.js sessions, revokes desktop bearer sessions, and sends an authenticated access change to every non-closed room in which the account has a membership record, including a previously revoked membership. The room Durable Object stores a versioned account-specific revocation cutoff before closing that user's tagged WebSockets, so a token issued before the ban cannot reconnect after the one-shot close event. Older access events cannot overwrite a newer decision, and a banned account cannot be reapproved as a room member. Every later web session, desktop session, room action, realtime credential, and TURN credential is also revalidated against the account state. Repeating a ban does not duplicate its audit entry, but deliberately retries session and socket revocation.

Unban changes the account back to active, writes the corresponding `UNBAN` audit record, and clears only the account-level realtime cutoff. A separate room-membership revocation is not erased accidentally. Unban does not recreate old sessions; the person signs in again.
