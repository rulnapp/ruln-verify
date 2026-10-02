import test from "node:test";
import assert from "node:assert/strict";
import { getAddressEncoder } from "@solana/kit";
import { PUMP_FEES_PROGRAM, PUMP_PROGRAM, addresses, decodeSharingConfig, inspectToken } from "../src/index.mjs";

const MINT = "9tYs5SAgVFuyeDMGehahjNAa4zt14Kob6pFJy5p1pump";
const CREATOR = "K6Eh9fwKkrhVNq6SpRtJn7F4Myi3HUst5QP8x5BKHnR";
const TREASURY = "8viA7g7JomzdagXfthZF6x6rkyQPrqbcYH2EjsJ1d3AK";
const enc = getAddressEncoder();
const b64 = data => Buffer.from(data).toString("base64");

function curve(creator, soldShare = .25) {
  const data = new Uint8Array(150); data.set([23, 183, 248, 55, 96, 216, 172, 96]);
  new DataView(data.buffer).setBigUint64(24, BigInt(Math.round(793_100_000_000_000 * (1 - soldShare))), true);
  data.set(enc.encode(creator), 49); return data;
}
function sharing(mint, admin, holders) {
  const data = new Uint8Array(80 + holders.length * 34); const view = new DataView(data.buffer);
  data.set([216, 74, 9, 0, 56, 140, 93, 75]); data[10] = 1; data.set(enc.encode(mint), 11); data.set(enc.encode(admin), 43);
  view.setUint32(76, holders.length, true);
  holders.forEach(([address, bps], i) => { data.set(enc.encode(address), 80 + i * 34); view.setUint16(112 + i * 34, bps, true); });
  return data;
}
async function chain(holders) {
  const pdas = await addresses(MINT);
  const accounts = { [MINT]: { owner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", lamports: 1, data: ["", "base64"] }, [pdas.bondingCurve]: { owner: PUMP_PROGRAM, lamports: 1, data: [b64(curve(pdas.sharingConfig)), "base64"] }, [pdas.creatorVault]: { owner: "11111111111111111111111111111111", lamports: 890_880 + 42_000_000, data: ["", "base64"] } };
  if (holders) accounts[pdas.sharingConfig] = { owner: PUMP_FEES_PROGRAM, lamports: 1, data: [b64(sharing(MINT, CREATOR, holders)), "base64"] };
  return async (method, params) => ({ value: params[0].map(address => accounts[address] || null) });
}

test("decodes a Pump.fun fee sharing config", () => {
  const config = decodeSharingConfig(sharing(MINT, CREATOR, [[CREATOR, 8000], [TREASURY, 2000]]));
  assert.deepEqual(config.shareholders, [{ address: CREATOR, shareBps: 8000 }, { address: TREASURY, shareBps: 2000 }]);
  assert.equal(config.status, "active"); assert.equal(config.mint, MINT);
});

test("a RULN token passes every check", async () => {
  const report = await inspectToken(await chain([[CREATOR, 8000], [TREASURY, 2000]]), MINT, { treasury: TREASURY });
  assert.equal(report.ok, true, JSON.stringify(report.checks));
  assert.equal(report.curve.progress, 25); assert.equal(report.unclaimedFeesSol, 0.042);
});

test("a different split or a missing split fails the RULN check", async () => {
  const skewed = await inspectToken(await chain([[CREATOR, 9500], [TREASURY, 500]]), MINT, { treasury: TREASURY });
  assert.equal(skewed.ok, false); assert.match(skewed.checks.at(-1).detail, /treasury 5%/);
  const none = await inspectToken(await chain(null), MINT, { treasury: TREASURY });
  assert.equal(none.ok, false); assert.equal(none.feeSplit, null);
});
