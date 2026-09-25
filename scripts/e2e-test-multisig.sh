#!/bin/bash

# Exit immediately if any command fails (non-zero status)
set -e

# Number of proposals to loop through (defaults to 1 if no argument is provided)
LOOPS=${1:-1}

echo "🚀 Starting 2-of-3 Multisig E2E Test..."
echo "🔄 Will execute $LOOPS proposal cycle(s)."

# --- Configuration Variables ---
SIGNERS="crystal_alice,crystal_bob,crystal_charlie"
THRESHOLD=2
ALICE="crystal_alice"
BOB="crystal_bob"
FUNDING_AMOUNT=1000
TRANSFER_AMOUNT=10
EXPIRY=1000

# --- Step 0: Predict Address ---
echo "🔍 Predicting multisig address..."

MULTISIG_ADDR=$(quantus multisig predict-address \
  --signers "$SIGNERS" \
  --threshold $THRESHOLD \
  --nonce 0 | grep -oE '[1-9A-HJ-NP-Za-km-z]{47,49}' | head -n 1)

if [ -z "$MULTISIG_ADDR" ]; then
    echo "❌ Failed to extract the multisig address from the CLI output."
    exit 1
fi

echo "✅ Target Multisig Address: $MULTISIG_ADDR"
echo "------------------------------------------------"

# --- Step 1: Create the multisig (Idempotent) ---
echo "🛠️ [1/6] Creating the multisig..."
quantus multisig create \
  --signers "$SIGNERS" \
  --threshold $THRESHOLD \
  --from $ALICE \
  --wait-for-transaction || echo "ℹ️ Multisig may already exist. Proceeding..."

# --- Step 2: Fund the multisig ---
echo "💸 [2/6] Funding the multisig with $FUNDING_AMOUNT..."
quantus send \
  --from $ALICE \
  --to "$MULTISIG_ADDR" \
  --amount $FUNDING_AMOUNT \
  --wait-for-transaction || echo "ℹ️ Funding command returned non-zero, continuing..."

echo "------------------------------------------------"

# --- Step 2.5: Fetch Starting Proposal Nonce ---
echo "📊 Fetching current multisig info to get Proposal Nonce..."

# Grab the line containing "Proposal Nonce:", then extract just the numbers
CURRENT_NONCE=$(quantus multisig info --address "$MULTISIG_ADDR" | grep -i "Proposal Nonce:" | grep -oE '[0-9]+')

# If the command fails or returns empty (e.g., brand new multisig state edge case), default to 1
if [ -z "$CURRENT_NONCE" ]; then
    echo "⚠️ Could not detect Proposal Nonce from info. Defaulting to 0."
    PROPOSAL_ID=0
else
    PROPOSAL_ID=$CURRENT_NONCE
fi

echo "🔢 Starting Proposal ID will be: $PROPOSAL_ID"
echo "------------------------------------------------"

# --- Loop for Proposals ---
for (( i=1; i<=LOOPS; i++ ))
do
    echo "🔄 --- Starting Proposal Cycle $i of $LOOPS (ID: $PROPOSAL_ID) ---"

    # --- Step 3: Propose a transfer ---
    echo "📝 [3/6] Proposing a transfer of $TRANSFER_AMOUNT to $BOB..."
    quantus multisig propose transfer \
      --address "$MULTISIG_ADDR" \
      --to $BOB \
      --amount $TRANSFER_AMOUNT \
      --expiry $EXPIRY \
      --from $ALICE \
      --wait-for-transaction

    # --- Step 4: Approve (second signature) ---
    echo "✍️ [4/6] Approving proposal $PROPOSAL_ID from $BOB..."
    quantus multisig approve \
      --address "$MULTISIG_ADDR" \
      --proposal-id "$PROPOSAL_ID" \
      --from $BOB \
      --wait-for-transaction

    # --- Step 5: Execute ---
    echo "⚙️ [5/6] Executing the approved proposal $PROPOSAL_ID..."
    quantus multisig execute \
      --address "$MULTISIG_ADDR" \
      --proposal-id "$PROPOSAL_ID" \
      --from $ALICE \
      --wait-for-transaction

    # --- Step 6: Claim deposits from removed proposals ---
    echo "💰 [6/6] Claiming deposits..."
    quantus multisig claim-deposits \
      --address "$MULTISIG_ADDR" \
      --from $ALICE \
      --wait-for-transaction
      
    echo "✅ Cycle $i completed successfully."
    echo "------------------------------------------------"
    
    # Increment the Proposal ID for the next loop iteration
    PROPOSAL_ID=$((PROPOSAL_ID + 1))
done

echo "🎉 Success! End-to-end multisig workflow completed."