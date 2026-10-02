export type ExpiringGrant<T> = {
  value: T;
  ownerId: number;
  expiresAt: number;
};

export class ExpiringGrantStore<T> {
  readonly #grants = new Map<string, ExpiringGrant<T>>();

  set(token: string, grant: ExpiringGrant<T>) {
    this.#grants.set(token, grant);
  }

  take(token: string, ownerId: number, now = Date.now()): T | null {
    const grant = this.#grants.get(token);
    this.#grants.delete(token);
    if (!grant || grant.ownerId !== ownerId || grant.expiresAt <= now) return null;
    return grant.value;
  }

  clearOwner(ownerId: number, now = Date.now()) {
    for (const [token, grant] of this.#grants) {
      if (grant.ownerId === ownerId || grant.expiresAt <= now) this.#grants.delete(token);
    }
  }
}
