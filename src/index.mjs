import { getAddressDecoder, getAddressEncoder, getProgramDerivedAddress } from "@solana/kit";

// Read-only checks of RULN arena tokens on Solana mainnet. Nothing here signs or sends transactions.

export const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const PUMP_FEES_PROGRAM = "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ";
export const TOKEN_PROGRAMS = new Set(["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"]);
export const CREATOR_SHARE_BPS = 8000;
export const TREASURY_SHARE_BPS = 2000;
const CURVE_DISCRIMINATOR = [23, 183, 248, 55, 96, 216, 172, 96];
const SHARING_DISCRIMINATOR = [216, 74, 9, 0, 56, 140, 93, 75];
const INITIAL_REAL_TOKEN_RESERVES = 793_100_000_000_000n;
const SYSTEM = "11111111111111111111111111111111";

const encoder = getAddressEncoder(); const decoder = getAddressDecoder();
const bytes = base64 => new Uint8Array(Buffer.from(base64, "base64"));
const matches = (data, discriminator) => discriminator.every((byte, i) => data[i] === byte);

export function rpcClient(url = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", fetchImpl = globalThis.fetch) {
  let id = 0;
  return async (method, params = []) => {
    const response = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
    const payload = await response.json();
    if (payload.error) throw new Error(`RPC ${method}: ${payload.error.message}`);
    return payload.result;
  };
}

export async function addresses(mint) {
  const pda = async (program, seeds) => (await getProgramDerivedAddress({ programAddress: program, seeds }))[0];
  const [bondingCurve, sharingConfig] = await Promise.all([pda(PUMP_PROGRAM, ["bonding-curve", encoder.encode(mint)]), pda(PUMP_FEES_PROGRAM, ["sharing-config", encoder.encode(mint)])]);
  const creatorVault = await pda(PUMP_PROGRAM, ["creator-vault", encoder.encode(sharingConfig)]);
  return { bondingCurve, sharingConfig, creatorVault };
}

export function decodeCurve(data) {
  if (data.length < 81 || !matches(data, CURVE_DISCRIMINATOR)) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const realToken = view.getBigUint64(24, true); const complete = data[48] === 1;
  return {
    creator: decoder.decode(data.subarray(49, 81)),
    complete,
    progress: complete ? 100 : Number((INITIAL_REAL_TOKEN_RESERVES - realToken) * 10_000n / INITIAL_REAL_TOKEN_RESERVES) / 100,
    realSol: Number(view.getBigUint64(32, true)) / 1e9,
  };
}

export function decodeSharingConfig(data) {
  if (data.length < 80 || !matches(data, SHARING_DISCRIMINATOR)) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = view.getUint32(76, true); const shareholders = [];
  for (let i = 0, offset = 80; i < count && offset + 34 <= data.length; i += 1, offset += 34) shareholders.push({ address: decoder.decode(data.subarray(offset, offset + 32)), shareBps: view.getUint16(offset + 32, true) });
  return { status: data[10] === 1 ? "active" : "paused", mint: decoder.decode(data.subarray(11, 43)), admin: decoder.decode(data.subarray(43, 75)), adminRevoked: data[75] === 1, shareholders };
}

// Full report for one token. `treasury` (optional) checks the exact RULN split: creator 80% / treasury 20%.
export async function inspectToken(rpc, mint, { treasury } = {}) {
  const pdas = await addresses(mint);
  const result = await rpc("getMultipleAccounts", [[mint, pdas.bondingCurve, pdas.sharingConfig, pdas.creatorVault], { encoding: "base64", commitment: "confirmed" }]);
  const [mintAccount, curveAccount, sharingAccount, vaultAccount] = result.value;
  const report = { mint, ...pdas, isToken: Boolean(mintAccount && TOKEN_PROGRAMS.has(mintAccount.owner)), isPumpToken: false, curve: null, feeSplit: null, unclaimedFeesSol: vaultAccount ? Math.max(0, vaultAccount.lamports - 890_880) / 1e9 : 0, checks: [] };
  if (curveAccount?.owner === PUMP_PROGRAM) { report.curve = decodeCurve(bytes(curveAccount.data[0])); report.isPumpToken = Boolean(report.curve); }
  if (sharingAccount?.owner === PUMP_FEES_PROGRAM) report.feeSplit = decodeSharingConfig(bytes(sharingAccount.data[0]));
  const check = (name, ok, detail) => report.checks.push({ name, ok, detail });
  check("SPL token mint", report.isToken, mintAccount ? mintAccount.owner : "account not found");
  check("Created on Pump.fun", report.isPumpToken, !report.isPumpToken ? "no bonding curve" : report.curve.creator === report.sharingConfig ? "creator fees routed to the fee sharing config" : report.curve.creator === SYSTEM ? "creator not recorded (token predates creator fees)" : `creator ${report.curve.creator}`);
  check("Creator fees are shared", report.feeSplit?.status === "active", report.feeSplit ? `${report.feeSplit.shareholders.length} shareholders` : "no fee sharing config");
  if (treasury) {
    const holders = report.feeSplit?.shareholders || [];
    const treasuryShare = holders.find(holder => holder.address === treasury)?.shareBps;
    const creatorShare = holders.find(holder => holder.address !== treasury)?.shareBps;
    check("RULN split 80 / 20", holders.length === 2 && treasuryShare === TREASURY_SHARE_BPS && creatorShare === CREATOR_SHARE_BPS, treasuryShare ? `treasury ${treasuryShare / 100}% · creator ${(creatorShare ?? 0) / 100}%` : "treasury is not a shareholder");
  }
  report.ok = report.checks.every(item => item.ok);
  return report;
}

export async function inspectTreasury(rpc, address, { limit = 10 } = {}) {
  const [balance, signatures] = await Promise.all([rpc("getBalance", [address, { commitment: "confirmed" }]), rpc("getSignaturesForAddress", [address, { limit }])]);
  return { address, balanceSol: balance.value / 1e9, recent: signatures.map(item => ({ signature: item.signature, time: item.blockTime ? new Date(item.blockTime * 1000).toISOString() : null, ok: !item.err })) };
}

export const isSystemAddress = value => value === SYSTEM;
