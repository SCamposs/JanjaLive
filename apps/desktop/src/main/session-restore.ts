import type { AuthStatus } from "../shared/contracts";

type SignedIn = Extract<AuthStatus, { state: "signed-in" }>;

export async function restoreSavedSession({ read, validate, clear }: {
  read: () => Promise<{ token: string } | null>;
  validate: (token: string) => Promise<SignedIn | null>;
  clear: () => Promise<void>;
}) {
  const stored = await read();
  if (stored) {
    // Transport and service errors propagate without deleting valid credentials.
    const status = await validate(stored.token);
    if (status) return { token: stored.token, status };
  }
  await clear();
  return null;
}
