import type {
  Activity,
  ERC1155Transfer,
  ERC20Transfer,
  ERC721Transfer,
  Erc1155Activity,
  Erc20Activity,
  Erc721Activity,
  InternalActivity,
  InternalTransaction,
  NormalActivity,
  Transaction,
} from './types'

// Pure functions: raw record in, Activity out. Nothing is fetched, nothing
// is stored, nothing is merged. Each record keeps its sourceType and its
// source-specific fields.

export function normalizeNormalTransaction(tx: Transaction): NormalActivity {
  return {
    sourceType: 'normal',
    sourceLabel: 'Normal transaction',
    hash: tx.hash,
    blockNumber: tx.blockNumber,
    timeStamp: tx.timeStamp,
    from: tx.from,
    to: tx.to,
    value: tx.value,
    input: tx.input,
    methodId: tx.methodId,
    functionName: tx.functionName,
    contractAddress: tx.contractAddress,
  }
}

export function normalizeErc20Transfer(t: ERC20Transfer): Erc20Activity {
  return {
    sourceType: 'erc20',
    sourceLabel: 'ERC-20 transfer',
    hash: t.hash,
    blockNumber: t.blockNumber,
    timeStamp: t.timeStamp,
    from: t.from,
    to: t.to,
    value: t.value,
    contractAddress: t.contractAddress,
    tokenName: t.tokenName,
    tokenSymbol: t.tokenSymbol,
    tokenDecimal: t.tokenDecimal,
    transactionIndex: t.transactionIndex,
    methodId: t.methodId,
    functionName: t.functionName,
    statusRep: t.statusRep,
  }
}

export function normalizeErc721Transfer(t: ERC721Transfer): Erc721Activity {
  return {
    sourceType: 'erc721',
    sourceLabel: 'ERC-721 transfer',
    hash: t.hash,
    blockNumber: t.blockNumber,
    timeStamp: t.timeStamp,
    from: t.from,
    to: t.to,
    contractAddress: t.contractAddress,
    tokenID: t.tokenID,
    tokenName: t.tokenName,
    tokenSymbol: t.tokenSymbol,
    transactionIndex: t.transactionIndex,
    methodId: t.methodId,
    functionName: t.functionName,
  }
}

export function normalizeErc1155Transfer(t: ERC1155Transfer): Erc1155Activity {
  return {
    sourceType: 'erc1155',
    sourceLabel: 'ERC-1155 transfer',
    hash: t.hash,
    blockNumber: t.blockNumber,
    timeStamp: t.timeStamp,
    from: t.from,
    to: t.to,
    contractAddress: t.contractAddress,
    tokenID: t.tokenID,
    tokenValue: t.tokenValue,
    tokenName: t.tokenName,
    tokenSymbol: t.tokenSymbol,
    transactionIndex: t.transactionIndex,
    methodId: t.methodId,
    functionName: t.functionName,
  }
}

export function normalizeInternalTransaction(t: InternalTransaction): InternalActivity {
  return {
    sourceType: 'internal',
    sourceLabel: 'Internal transaction',
    hash: t.hash,
    blockNumber: t.blockNumber,
    timeStamp: t.timeStamp,
    from: t.from,
    to: t.to,
    value: t.value,
    contractAddress: t.contractAddress,
    input: t.input,
    type: t.type,
    gas: t.gas,
    gasUsed: t.gasUsed,
    traceId: t.traceId,
    isError: t.isError,
    errCode: t.errCode,
  }
}

// Normalizes all five datasets, combines them, sorts newest first.
// Every record is kept. There is NO deduplication by hash: a normal
// transaction and its ERC-20 events share a hash but mean different things.
export function buildUnifiedActivities(
  normal: Transaction[],
  erc20: ERC20Transfer[],
  erc721: ERC721Transfer[],
  erc1155: ERC1155Transfer[],
  internal: InternalTransaction[],
): Activity[] {
  const activities: Activity[] = [
    ...normal.map(normalizeNormalTransaction),
    ...erc20.map(normalizeErc20Transfer),
    ...erc721.map(normalizeErc721Transfer),
    ...erc1155.map(normalizeErc1155Transfer),
    ...internal.map(normalizeInternalTransaction),
  ]

  // Newest first. Order within the same timestamp is not meaningful yet.
  return activities.sort((a, b) => Number(b.timeStamp) - Number(a.timeStamp))
}