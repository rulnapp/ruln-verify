<p align="center"><img src="https://app.ruln.app/assets/brand/ruln-logo-192.png" width="96" alt="RULN" /></p>

# ruln-verify

Check any [RULN](https://app.ruln.app) arena token on Solana yourself. Read-only: it never signs or sends anything.

Every arena token locks its Pump.fun creator fees on-chain: **80% to the creator, 20% to the RULN treasury**. Pump.fun allows the split to be written once, after that nobody can change it — not the creator, not RULN. This tool reads the split straight from the Pump.fun fee program.

## Check a token

```bash
npx github:ruln-app/ruln-verify token <MINT> --treasury <RULN_TREASURY>
```

```
Token      <MINT>
Curve      25.00% · 3.112 SOL raised
Fee share   80.00%  <creator wallet>
Fee share   20.00%  <treasury>  (RULN treasury)
Unclaimed  0.0420 SOL waiting in the creator vault

✓ SPL token mint             TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
✓ Created on Pump.fun        creator fees routed to the fee sharing config
✓ Creator fees are shared    2 shareholders
✓ RULN split 80 / 20         treasury 20% · creator 80%
```

Exit code is `0` only when every check passes. Add `--json` for machine-readable output.

## Check the treasury

```bash
npx github:ruln-app/ruln-verify treasury <RULN_TREASURY>
```

Shows the balance and recent transactions with Solscan links: fee splits coming in, King rewards going out.

## What is checked

| Check | Source |
|---|---|
| SPL token mint | mint account owner (Token or Token-2022 program) |
| Created on Pump.fun | bonding curve PDA `["bonding-curve", mint]` of `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` |
| Creator fees are shared | sharing config PDA `["sharing-config", mint]` of `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ` |
| RULN split 80 / 20 | shareholders in the sharing config |

## RPC

Uses `https://api.mainnet-beta.solana.com` by default. Set `SOLANA_RPC_URL` or pass `--rpc <url>` for your own endpoint. `RULN_TREASURY` can be set instead of `--treasury`.

## Official addresses

| | Address |
|---|---|
| RULN treasury | _published at launch_ |

## License

MIT
