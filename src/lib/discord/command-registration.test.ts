import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

function registration(options: { publicBot?: boolean; wrongApp?: boolean; cleanup?: boolean; disabled?: boolean } = {}) {
  const appId = "100000000000000090";
  const code = `
    const calls=[];
    globalThis.fetch=async(url,init)=>{
      calls.push({path:new URL(url).pathname,method:init.method,body:init.body?JSON.parse(init.body):null});
      if(url.endsWith('/oauth2/applications/@me')) return Response.json({id:${JSON.stringify(options.wrongApp ? "100000000000000091" : appId)},bot_public:${options.publicBot ?? false}});
      if(init.method==='GET') return Response.json([{id:'100000000000000001',name:'janja'},{id:'100000000000000002',name:'janja-limpar'},{id:'100000000000000003',name:'unrelated'}]);
      return init.method==='DELETE'?new Response(null,{status:204}):Response.json({});
    };
    ${options.cleanup ? "process.argv.push('--remove-guild-commands=100000000000000080');" : ""}
    await import('./tools/discord-call/register.mjs');
    console.log('CAPTURED:'+JSON.stringify(calls));
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8",
    env: { NODE_ENV: "test", SystemRoot: process.env.SystemRoot, DISCORD_CALLS_ENABLED: options.disabled ? "false" : "true",
      DISCORD_BOT_APPLICATION_ID: appId, DISCORD_BOT_TOKEN: "fixture-token-not-real" } });
  const captured = result.stdout.split(/\r?\n/).find(line => line.startsWith("CAPTURED:"));
  return { status: result.status, calls: JSON.parse(captured!.slice(9)) as Array<{ path: string; method: string; body: Record<string, unknown> | null }> };
}
it("upserts only the two server-install-only global commands, preserving unrelated commands", () => {
  const result = registration(); expect(result.status).toBe(0);
  const mutations = result.calls.filter(call => call.method === "POST");
  expect(mutations).toHaveLength(2);
  for (const call of mutations) {
    expect(call.path).toBe("/api/v10/applications/100000000000000090/commands");
    expect(call.body?.integration_types).toEqual([0]); expect(call.body?.contexts).toEqual([0]);
  }
  expect(mutations[1].body?.default_member_permissions).toBe("8192");
  expect(result.calls.some(call => call.method === "PUT" || call.method === "DELETE")).toBe(false);
});
it("refuses global registration with a public bot, a mismatching token identity or a disabled flag", () => {
  for (const options of [{ publicBot: true }, { wrongApp: true }, { disabled: true }]) {
    const result = registration(options); expect(result.status).toBe(1);
    expect(result.calls.some(call => call.method === "POST")).toBe(false);
  }
});
it("removes only explicitly selected legacy command names after global registration", () => {
  const result = registration({ cleanup: true }); expect(result.status).toBe(0);
  const deleted = result.calls.filter(call => call.method === "DELETE");
  expect(deleted).toHaveLength(2);
  expect(deleted.every(call => call.path.includes("/guilds/100000000000000080/commands/"))).toBe(true);
  expect(deleted.some(call => call.path.endsWith("100000000000000003"))).toBe(false);
});
