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

export type HistoryResponse = {
  transactions: Transaction[]
  requestedLimit: number
  mayHaveMore: boolean
}

export type ERC20Transfer = {
  hash: string
  blockNumber: string
  timeStamp: string
  from: string
  to: string
  contractAddress: string
  value: string
  tokenName: string
  tokenSymbol: string
  tokenDecimal: string
  transactionIndex: string
  methodId?: string
  functionName?: string
  statusRep?: string
}

export type ERC20HistoryResponse = {
  transfers: ERC20Transfer[]
  requestedLimit: number
  mayHaveMore: boolean
}