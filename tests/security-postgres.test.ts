import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/neon-http";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQLWrapper } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "../src/db/schema";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({ getDb: () => holder.db }));
const discordMock = vi.hoisted(() => ({ channelId: "100000000000000001" }));
vi.mock("../src/lib/discord/api", () => ({ getDiscordVoiceChannel: vi.fn(async () => discordMock.channelId) }));
import { activateRoomMember, createRoom, assertAuthorizedRoom, getRoomSnapshotByPublicId } from "../src/lib/rooms";
import { generateTurnCredentials } from "../src/lib/turn";

const testUrl = process.env.SECURITY_TEST_POSTGRES_URL;
if (!testUrl) throw new Error("SECURITY_TEST_POSTGRES_URL must point to a disposable local PostgreSQL database");
const parsedUrl = new URL(testUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(parsedUrl.hostname) || !parsedUrl.pathname.startsWith("/janjalive_test")) {
  throw new Error("Refusing to run destructive fixtures outside a local janjalive_test database");
}

function psql(input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.SECURITY_TEST_PSQL ?? "psql", [testUrl!, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], { windowsHide: true });
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output.replaceAll("\r\n", "\n")) : reject(new Error(error)));
    child.stdin.end(input);
  });
}

function literal(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return String(value);
  const text = value instanceof Date ? value.toISOString() : String(value);
  return `'${text.replaceAll("'", "''")}'`;
}

// Use the application's actual Drizzle SQL. Only the transport changes: psql
// instead of Neon HTTP. Each batch runs in one READ COMMITTED transaction.
async function batch(queries: SQLWrapper[]) {
  const dialect = new PgDialect();
  const statements = queries.map((query) => {
    const prepared = dialect.sqlToQuery(query.getSQL());
    let text = prepared.sql.replace(/\$(\d+)/g, (_, index) => literal(prepared.params[Number(index) - 1]));
    if (/^(insert|update|delete) /i.test(text) && !/\breturning\b/i.test(text)) text += " returning 1";
    return `with result as (${text}) select coalesce(json_agg(result), '[]') from result;`;
  });
  const output = await psql(`begin;\n${statements.join("\n")}\ncommit;`);
  return output.trim().split(/\r?\n/).map((line) => ({ rows: JSON.parse(line) as unknown[] }));
}

async function localQuery(query: string, params: unknown[], options: { arrayMode?: boolean }) {
  let text = query.replace(/\$(\d+)/g, (_, index) => literal(params[Number(index) - 1]));
  if (/^(insert|update|delete) /i.test(text) && !/\breturning\b/i.test(text)) text += " returning 1";
  const projection = options.arrayMode
    ? "(select json_agg(value) from json_each(row_to_json(result)))" : "row_to_json(result)";
  const output = await psql(`with result as (${text}) select coalesce(json_agg(${projection}), '[]') from result;`);
  return { rows: JSON.parse(output.trim()) };
}

describe("resource limits against real PostgreSQL", () => {
  beforeAll(async () => {
    const db = drizzle({ client: { query: localQuery } as never, schema });
    Object.assign(db, { batch });
    holder.db = db;
    await psql("drop schema public cascade; create schema public;");
    for (const file of (await readdir("drizzle")).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
      await psql(await readFile(`drizzle/${file}`, "utf8"));
    }
  });
  beforeEach(async () => {
    delete process.env.ROOM_CREATION_ENABLED;
    discordMock.channelId = "100000000000000001";
    await psql("truncate users cascade; insert into users(id, discord_id) select 'user-' || n, (100000000000000000::bigint + n)::text from generate_series(0,30) n;");
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("allows exactly five active rooms under concurrent creation", async () => {
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => createRoom({ userId: "user-0", accessMode: "APPROVAL" })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(5);
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason.message).toBe("ACTIVE_ROOM_LIMIT_REACHED");
    }
    expect(await psql("select count(*) from rooms;")).toBe("5\n");
    expect(await psql("select count(*) from room_members where role = 'OWNER';")).toBe("5\n");
  });

  it("cannot bypass the daily budget by deleting rooms", async () => {
    await psql("update users set room_creation_count = 19 where id = 'user-0';");
    const room = await createRoom({ userId: "user-0", accessMode: "APPROVAL" });
    await psql(`delete from rooms where id = ${literal(room.id)};`);
    await expect(createRoom({ userId: "user-0", accessMode: "APPROVAL" })).rejects.toThrow("DAILY_ROOM_LIMIT_REACHED");
    await psql("update users set room_creation_window_at = now() - interval '25 hours' where id = 'user-0';");
    await expect(createRoom({ userId: "user-0", accessMode: "APPROVAL" })).resolves.toHaveProperty("id");
    expect(await psql("select room_creation_count from users where id = 'user-0';")).toBe("1\n");
  });

  it("caps concurrent approvals and invite joins at twenty members including the owner", async () => {
    const room = await createRoom({ userId: "user-0", accessMode: "INVITE" });
    const results = await Promise.allSettled(Array.from({ length: 25 }, (_, index) => activateRoomMember(room.id, `user-${index + 1}`, index % 2 === 0)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(19);
    expect(await psql("select count(*) from room_members where revoked_at is null;")).toBe("20\n");
    await expect(activateRoomMember(room.id, "user-0", true)).resolves.toBeUndefined();
    expect(await psql("select role from room_members where user_id = 'user-0';")).toBe("OWNER\n");
  });

  it("serializes concurrent Discord creation across different owners without spending duplicate quotas", async () => {
    vi.stubEnv("DISCORD_CALLS_ENABLED", "true");
    vi.stubEnv("DISCORD_CALLS_GUILD_ID", "1156443434362617927");
    const input = { guildId: "1156443434362617927", channelId: "100000000000000001" };
    const created = await Promise.all(Array.from({ length: 8 }, (_, n) => createRoom({ userId: `user-${n}`, accessMode: "APPROVAL", discordCall: input })));
    expect(new Set(created.map(room => room.id)).size).toBe(1);
    expect(await psql("select count(*) from rooms;")).toBe("1\n");
    expect(await psql("select sum(room_creation_count) from users;")).toBe("1\n");
    expect(await psql("select count(*) from room_members;")).toBe("1\n");
  });

  it("reuses a Discord session even if the next caller has no remaining creation slots", async () => {
    vi.stubEnv("DISCORD_CALLS_ENABLED", "true");
    vi.stubEnv("DISCORD_CALLS_GUILD_ID", "1156443434362617927");
    const input = { guildId: "1156443434362617927", channelId: "100000000000000001" };
    const created = await createRoom({ userId: "user-0", accessMode: "APPROVAL", discordCall: input });
    await psql("update users set room_creation_count = 20 where id = 'user-1';");
    expect((await createRoom({ userId: "user-1", accessMode: "APPROVAL", discordCall: input })).id).toBe(created.id);
    expect(await psql("select room_creation_count from users where id = 'user-1';")).toBe("20\n");
  });

  it("expires an old Discord session without resurrecting its room or bypassing the daily quota", async () => {
    vi.stubEnv("DISCORD_CALLS_ENABLED", "true");
    vi.stubEnv("DISCORD_CALLS_GUILD_ID", "1156443434362617927");
    const input = { guildId: "1156443434362617927", channelId: "100000000000000001" };
    const first = await createRoom({ userId: "user-0", accessMode: "APPROVAL", discordCall: input });
    await psql(`update rooms set expires_at = now() - interval '1 minute' where id = ${literal(first.id)};`);
    const second = await createRoom({ userId: "user-0", accessMode: "APPROVAL", discordCall: input });
    expect(second.id).not.toBe(first.id);
    expect(await psql("select count(*) from rooms where closed_at is null;")).toBe("1\n");
    expect(await psql("select room_creation_count from users where id = 'user-0';")).toBe("2\n");
    await psql("update users set room_creation_count = 20 where id = 'user-0';");
    discordMock.channelId = "100000000000000002";
    await expect(createRoom({ userId: "user-0", accessMode: "APPROVAL", discordCall: { ...input, channelId: "100000000000000002" } }))
      .rejects.toThrow("DAILY_ROOM_LIMIT_REACHED");
  });

  it("does not create a Discord session with flag off or wrong guild", async () => {
    const input = { guildId: "1156443434362617927", channelId: "100000000000000001" };
    await expect(createRoom({ userId: "user-0", accessMode: "APPROVAL", discordCall: input })).rejects.toThrow("DISCORD_UNAVAILABLE");
    vi.stubEnv("DISCORD_CALLS_ENABLED", "true");
    vi.stubEnv("DISCORD_CALLS_GUILD_ID", input.guildId);
    await expect(createRoom({ userId: "user-0", accessMode: "APPROVAL", discordCall: { ...input, guildId: "100000000000000002" } }))
      .rejects.toThrow("DISCORD_UNAVAILABLE");
    expect(await psql("select count(*) from rooms;")).toBe("0\n");
  });

  it("does not reactivate a revoked call grant through public entry or issue access to a banned participant", async () => {
    vi.stubEnv("DISCORD_CALLS_ENABLED", "true");
    vi.stubEnv("DISCORD_CALLS_GUILD_ID", "1156443434362617927");
    const created = await createRoom({ userId: "user-0", accessMode: "APPROVAL",
      discordCall: { guildId: "1156443434362617927", channelId: "100000000000000001" } });
    await activateRoomMember(created.id, "user-1", false);
    await psql("update room_members set revoked_at = now() where user_id = 'user-1'; update users set account_status = 'BANNED' where id = 'user-2';");
    const publicId = (await psql(`select public_id from rooms where id = ${literal(created.id)};`)).trim();
    await expect(getRoomSnapshotByPublicId(publicId, "user-1")).rejects.toThrow("ROOM_FORBIDDEN");
    await expect(assertAuthorizedRoom(created.id, "user-1")).rejects.toThrow("ROOM_FORBIDDEN");
    await expect(activateRoomMember(created.id, "user-2", false)).rejects.toThrow("ROOM_MEMBER_LIMIT_REACHED");
    await expect(getRoomSnapshotByPublicId(publicId, "user-2")).rejects.toThrow("ACCOUNT_DISABLED");
    expect(await psql("select count(*) from room_members where revoked_at is null;")).toBe("1\n");
  });

  it("admits a verified call participant without approval but keeps outsiders out of realtime", async () => {
    vi.stubEnv("DISCORD_CALLS_ENABLED", "true");
    vi.stubEnv("DISCORD_CALLS_GUILD_ID", "1156443434362617927");
    const created = await createRoom({ userId: "user-0", accessMode: "APPROVAL",
      discordCall: { guildId: "1156443434362617927", channelId: "100000000000000001" } });
    const publicId = (await psql(`select public_id from rooms where id = ${literal(created.id)};`)).trim();
    expect((await getRoomSnapshotByPublicId(publicId, "user-1"))?.access).toBe("authorized");
    expect(await psql("select count(*) from room_members where revoked_at is null;")).toBe("2\n");
    expect(await psql("select count(*) from join_requests;")).toBe("0\n");
    await expect(assertAuthorizedRoom(created.id, "user-3")).rejects.toThrow("ROOM_FORBIDDEN");
    discordMock.channelId = "100000000000000002";
    await expect(getRoomSnapshotByPublicId(publicId, "user-1")).rejects.toThrow("DISCORD_CALL_REQUIRED");
    // Existing session access remains valid until closure/revocation; only a new entry checks voice.
    await expect(assertAuthorizedRoom(created.id, "user-1")).resolves.toHaveProperty("room");
  });

  it("an invite cannot restore a revoked member, and banned accounts cannot join", async () => {
    const room = await createRoom({ userId: "user-0", accessMode: "INVITE" });
    await activateRoomMember(room.id, "user-1", false);
    await psql("update room_members set revoked_at = now() where user_id = 'user-1'; update users set account_status = 'BANNED' where id = 'user-2';");
    await expect(activateRoomMember(room.id, "user-1", false)).rejects.toThrow("ROOM_MEMBER_LIMIT_REACHED");
    await expect(activateRoomMember(room.id, "user-2", true)).rejects.toThrow("ROOM_MEMBER_LIMIT_REACHED");
    await expect(activateRoomMember(room.id, "user-1", true)).resolves.toBeUndefined();
  });

  for (const operation of ["ban", "logout"] as const) {
    it(`does not hand out TURN credentials when ${operation} happens during provider generation`, async () => {
      vi.stubEnv("CLOUDFLARE_TURN_KEY_ID", "test-key");
      vi.stubEnv("CLOUDFLARE_TURN_API_TOKEN", "test-only");
      let signalStarted!: () => void;
      let completeGeneration!: (value: Response) => void;
      const started = new Promise<void>((resolve) => { signalStarted = resolve; });
      const generation = new Promise<Response>((resolve) => { completeGeneration = resolve; });
      const provider = vi.fn(async (url: string) => {
        if (url.endsWith("generate-ice-servers")) { signalStarted(); return generation; }
        return new Response(null, { status: 204 });
      });
      vi.stubGlobal("fetch", provider);
      const issuing = generateTurnCredentials("user-0");
      // Attach a handler before deliberately allowing the promise to reject.
      const result = expect(issuing).rejects.toThrow("TURN_UNAVAILABLE");
      await started;
      await psql(operation === "ban"
        ? "update users set account_status = 'BANNED' where id = 'user-0';"
        : "update users set sessions_revoked_at = now() where id = 'user-0';");
      completeGeneration(Response.json({ iceServers: [{ urls: "turn:relay.example", username: "revocable-user", credential: "not-persisted" }] }));
      await result;
      expect(provider).toHaveBeenCalledTimes(2);
      expect(provider.mock.calls[1][0]).toContain("/credentials/revocable-user/revoke");
      expect(await psql("select count(*) from turn_credentials;")).toBe("0\n");
    });
  }
});
