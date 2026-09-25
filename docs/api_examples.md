Get to and from transfers

```
query GetAccountTransfers($accountId: ID!) {
  accountById(id: $accountId) {
    id
    transfersTo {
      id
      blockNumber
      timestamp
      extrinsicHash
      amount
      fee
      from {
        id
      }
      to {
        id
      }
    }
    transfersFrom {
      id
      blockNumber
      timestamp
      extrinsicHash
      amount
      fee
      from {
        id
      }
      to {
        id
      }
    }
  }
}
```