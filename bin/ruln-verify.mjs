#!/usr/bin/env node
import { inspectToken, inspectTreasury, rpcClient } from "../src/index.mjs";

const [command, target, ...rest] = process.argv.slice(2);
const flag = name => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
const rpc = rpcClient(flag("rpc"));
const treasury = flag("treasury") || process.env.RULN_TREASURY;
const json = rest.includes("--json");

if (command === "token" && target) {
  const report = await inspectToken(rpc, target, { treasury });
  if (json) { console.log(JSON.stringify(report, null, 2)); process.exit(report.ok ? 0 : 1); }
  console.log(`\nToken      ${report.mint}`);
  if (report.curve) console.log(`Curve      ${report.curve.complete ? "complete · migrated" : `${report.curve.progress.toFixed(2)}%`} · ${report.curve.realSol.toFixed(3)} SOL raised`);
  if (report.feeSplit) for (const holder of report.feeSplit.shareholders) console.log(`Fee share  ${(holder.shareBps / 100).toFixed(2).padStart(6)}%  ${holder.address}${holder.address === treasury ? "  (RULN treasury)" : ""}`);
  console.log(`Unclaimed  ${report.unclaimedFeesSol.toFixed(4)} SOL waiting in the creator vault\n`);
  for (const item of report.checks) console.log(`${item.ok ? "✓" : "✗"} ${item.name.padEnd(26)} ${item.detail}`);
  if (!treasury) console.log("\nAdd --treasury <address> to check the RULN 80/20 split.");
  process.exit(report.ok ? 0 : 1);
} else if (command === "treasury" && target) {
  const report = await inspectTreasury(rpc, target);
  if (json) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }
  console.log(`\nTreasury   ${report.address}\nBalance    ${report.balanceSol.toFixed(4)} SOL\n\nRecent transactions:`);
  for (const item of report.recent) console.log(`  ${item.ok ? "✓" : "✗"} ${item.time || "pending"}  https://solscan.io/tx/${item.signature}`);
} else {
  console.log(`ruln-verify — check RULN arena tokens on Solana

  ruln-verify token <mint> [--treasury <address>] [--rpc <url>] [--json]
  ruln-verify treasury <address> [--rpc <url>] [--json]

Environment: SOLANA_RPC_URL, RULN_TREASURY`);
  process.exitCode = command ? 1 : 0;
}
