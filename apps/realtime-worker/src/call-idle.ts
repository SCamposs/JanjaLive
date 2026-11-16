import { DISCORD_CALL_IDLE_TIMEOUT_MS } from "@janjalive/realtime-protocol";

type IdleState = { expiresAt: number | null };
export type CallLifecycle = { active: boolean; closed: boolean; idleExpiresAt: number | null };

/** Durable idle clock. Reads and retries never extend an empty room's lifetime. */
export class CallIdleSession {
  constructor(private ctx: DurableObjectState, private occupied: () => boolean) {}

  async configure(initialExpiresAt: number): Promise<CallLifecycle> {
    if (await this.ctx.storage.get<boolean>("room:closed")) return { active: false, closed: true, idleExpiresAt: null };
    let state = await this.ctx.storage.get<IdleState>("room:idle");
    if (!state) {
      state = { expiresAt: this.occupied() ? null : Math.min(initialExpiresAt, Date.now() + DISCORD_CALL_IDLE_TIMEOUT_MS) };
      await this.ctx.storage.put("room:idle", state);
      if (state.expiresAt === null) await this.ctx.storage.deleteAlarm();
      else await this.ctx.storage.setAlarm(state.expiresAt);
    }
    await this.alarm();
    const closed = Boolean(await this.ctx.storage.get<boolean>("room:closed"));
    const current = (await this.ctx.storage.get<IdleState>("room:idle"))!;
    return { active: !closed && this.occupied(), closed, idleExpiresAt: current.expiresAt };
  }

  async connected() {
    const state = await this.ctx.storage.get<IdleState>("room:idle");
    if (!state || await this.ctx.storage.get<boolean>("room:closed")) return;
    if (state.expiresAt !== null) await this.ctx.storage.put("room:idle", { expiresAt: null });
    await this.ctx.storage.deleteAlarm();
  }

  async disconnected() {
    const state = await this.ctx.storage.get<IdleState>("room:idle");
    if (!state || this.occupied() || state.expiresAt !== null || await this.ctx.storage.get<boolean>("room:closed")) return;
    const expiresAt = Date.now() + DISCORD_CALL_IDLE_TIMEOUT_MS;
    await this.ctx.storage.put("room:idle", { expiresAt });
    await this.ctx.storage.setAlarm(expiresAt);
  }

  async alarm(): Promise<"unconfigured" | "active" | "waiting" | "expired"> {
    const state = await this.ctx.storage.get<IdleState>("room:idle");
    if (!state) return "unconfigured";
    if (await this.ctx.storage.get<boolean>("room:closed")) return "expired";
    if (this.occupied()) { await this.connected(); return "active"; }
    if (state.expiresAt === null) { await this.disconnected(); return "waiting"; }
    if (state.expiresAt > Date.now()) { await this.ctx.storage.setAlarm(state.expiresAt); return "waiting"; }
    await this.ctx.storage.put("room:closed", true);
    return "expired";
  }
}
