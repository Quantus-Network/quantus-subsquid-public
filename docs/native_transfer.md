`NativeTransferred` is **not** a separate user action. It is emitted whenever `Wormhole::record_transfer` records a native transfer into the ZK trie. For indexers, that usually means the **same** movement already appears as `Balances.Transfer` or `Balances.Minted`.

## What emits it

Only one place deposits the event:

```766:773:pallets/wormhole/src/lib.rs
			if asset_id == T::AssetId::default() {
				Self::deposit_event(Event::<T>::NativeTransferred {
					from: from.clone().into(),
					to: to.clone().into(),
					amount,
					transfer_count: current_count,
					leaf_index,
				});
```

That happens whenever something calls `record_transfer` / `record_transfer_proof`.

## What triggers those calls

### 1. Main path: `WormholeProofRecorderExtension` (after almost every extrinsic)

After a successful extrinsic, the runtime scans **new** events and records proofs for:

| Source event | Becomes |
|---|---|
| `Balances.Transfer { from, to, amount }` | `NativeTransferred` |
| `Balances.Minted { who, amount }` | `NativeTransferred` (from = minting account) |
| `Assets.Transferred` | `AssetTransferred` |
| `Assets.Issued` | `AssetTransferred` |

```185:222:runtime/src/transaction_extensions.rs
						RuntimeEvent::Balances(pallet_balances::Event::Transfer {
							from,
							to,
							amount,
						}) => Some((None, from, to, amount)),
						// Native balance mints
						RuntimeEvent::Balances(pallet_balances::Event::Minted { who, amount }) => {
							let minting_account = crate::configs::MintingAccount::get();
							Some((None, minting_account, who, amount))
						},
						// ...
			<Wormhole as TransferProofRecorder<AccountId, AssetId, Balance>>::record_transfer_proof(
				asset_id, from, to, amount,
			);
```

So for normal user activity, every `Balances.Transfer` / `Balances.Minted` in a signed extrinsic also produces `Wormhole.NativeTransferred`. That is the duplicate you are seeing.

Covered call shapes (via their emitted balance/asset events): direct balances transfers, utility batches, multisig, recovery `as_recovered`, assets transfers/mints, etc.

### 2. Other callers (same event, different entry points)

| Caller | When |
|---|---|
| Genesis endowments | Block 1 `on_initialize` — emits `NativeTransferred` for genesis balances (events at genesis are not persisted) |
| `mining-rewards` | Miner/treasury reward mint — calls `record_transfer_proof` after `mint_into` |
| `reversible-transfers` | After a delayed transfer executes (scheduler path has no tx extension) |
| Wormhole exit | After minting exit funds with `increase_balance` |

## Indexer guidance

If you already index `Balances.Transfer` / `Balances.Minted`, **do not also treat `NativeTransferred` as a separate transfer**. Use one of:

- **Balance events only** for transfer history / balances, and use `NativeTransferred` only for wormhole/ZK fields (`transfer_count`, `leaf_index`), or  
- **`NativeTransferred` only** as the canonical transfer log (it includes mints + genesis endowments + exits that you may care about for wormhole).

`NativeTransferred` is the proof-recording mirror of native credits, not a second transfer.

### This indexer

Quantus Subsquid uses **`NativeTransferred` only** for `Transfer` entities (`Balances.Transfer` supplies fee/extrinsic hash lookup). [`UnifiedTransaction`](./unified_transaction.md) projects each movement once: wormhole-exit Transfers are typed `WORMHOLE` (not also as `IMMEDIATE` plus an aggregate wormhole row), and reversible settlements appear only as `EXECUTED_REVERSIBLE`.