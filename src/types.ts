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