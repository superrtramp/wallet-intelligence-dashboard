export type Transaction = {
  hash: string
  from: string
  to: string
  value: string
  blockNumber: string
  timeStamp: string
  input: string
  methodId: string
  functionName: string
  contractAddress: string
}

// Response shape of GET /api/history/:address
export type HistoryResponse = {
  transactions: Transaction[]
  requestedLimit: number
  mayHaveMore: boolean
}

// One ERC-20 Transfer EVENT (not a normal transaction).
// Deliberately NOT merged into `Transaction`: different fields, different meaning.
export type ERC20Transfer = {
  hash: string // the transaction that emitted this event (may repeat across records)
  blockNumber: string
  timeStamp: string // Unix seconds, as a string
  from: string // token sender
  to: string // token receiver
  contractAddress: string // the ERC-20 token contract itself
  value: string // RAW integer string. Never convert to a JS number.
  tokenName: string
  tokenSymbol: string
  tokenDecimal: string // how to read `value`: human amount = value / 10^tokenDecimal
  transactionIndex: string
  methodId?: string // may be absent depending on the Etherscan response
  functionName?: string // may be absent depending on the Etherscan response
  // Etherscan's token reputation metadata, preserved as-is:
  //   "0" = Unknown, "1" = Neutral, "2" = Unsafe
  // "Neutral" does NOT mean safe, and a missing value proves nothing.
  statusRep?: string
}

// Response shape of GET /api/erc20-history/:address
export type ERC20HistoryResponse = {
  transfers: ERC20Transfer[]
  requestedLimit: number
  mayHaveMore: boolean
}

// One ERC-721 (NFT) Transfer EVENT. Not a normal transaction, not ERC-20.
// Several records can share one `hash`. Do not deduplicate by hash.
export type ERC721Transfer = {
  hash: string // the transaction that emitted this event (may repeat)
  blockNumber: string
  timeStamp: string // Unix seconds, as a string
  from: string // previous owner. The zero address means this was a MINT
  to: string // new owner. The zero address means this was a BURN
  contractAddress: string // the NFT collection contract
  tokenID: string // the unique NFT inside that collection. Keep as a string
  tokenName: string
  tokenSymbol: string
  transactionIndex: string
  methodId?: string // may be absent depending on the Etherscan response
  functionName?: string // may be absent depending on the Etherscan response
}

// Response shape of GET /api/erc721-history/:address
export type ERC721HistoryResponse = {
  transfers: ERC721Transfer[]
  requestedLimit: number
  mayHaveMore: boolean
}

// One ERC-1155 (multi-token) transfer record. Separate from ERC-20/ERC-721.
// A batch transaction can produce several records with the same `hash`.
// Do not deduplicate or combine them.
export type ERC1155Transfer = {
  hash: string // the transaction that emitted this transfer (may repeat)
  blockNumber: string
  timeStamp: string // Unix seconds, as a string
  from: string // sender. The zero address means this was a MINT
  to: string // receiver. The zero address means this was a BURN
  contractAddress: string // the ERC-1155 contract
  tokenID: string // WHICH token inside the contract. Keep as a string
  tokenValue: string // HOW MANY units of that token moved. Keep as a string
  tokenName: string
  tokenSymbol: string
  transactionIndex: string
  methodId?: string // may be absent depending on the Etherscan response
  functionName?: string // may be absent depending on the Etherscan response
}

// Response shape of GET /api/erc1155-history/:address
export type ERC1155HistoryResponse = {
  transfers: ERC1155Transfer[]
  requestedLimit: number
  mayHaveMore: boolean
}

// One INTERNAL transaction record: value movement or a call that happened
// while a contract was executing a normal transaction. Not signed by anyone.
// Several records can share one `hash`; `traceId` tells them apart.
// Do not deduplicate or merge. All numeric values stay as strings.
export type InternalTransaction = {
  blockNumber: string
  timeStamp: string // Unix seconds, as a string
  hash: string // the OUTER normal transaction (may repeat across records)
  from: string
  to: string // may be empty, kept as returned
  value: string // native ETH in wei, as a raw integer string
  contractAddress: string // may be empty, kept as returned
  input: string
  type: string // execution kind reported by Etherscan (e.g. call / create)
  gas: string
  gasUsed: string
  traceId: string // position inside the transaction's trace
  isError: string // Etherscan flag, kept as returned
  errCode: string // error detail when the operation failed
}

// Response shape of GET /api/internal-history/:address
export type InternalHistoryResponse = {
  transactions: InternalTransaction[]
  requestedLimit: number
  mayHaveMore: boolean
}