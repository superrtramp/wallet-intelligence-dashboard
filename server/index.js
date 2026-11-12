import 'dotenv/config'
import express from 'express'
import cors from 'cors'

const app = express()
const PORT = 3001
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY

app.use(cors({ origin: 'http://localhost:5173' }))

// DEV ONLY: log how long each request takes. Safe to delete.
// It only sees requests to OUR server (never Etherscan URLs or API keys),
// and it replaces wallet addresses with ":address" in the output.
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return next()
  }

  const start = Date.now()

  res.on('finish', () => {
    const safePath = req.path.replace(/0x[a-fA-F0-9]{40}/g, ':address')
    console.log(
      `${req.method} ${safePath} — ${Date.now() - start}ms (status ${res.statusCode})`,
    )
  })

  next()
})

// --- Etherscan request scheduler -------------------------------------------
// Etherscan Free allows about 3 calls per second. Every Etherscan request in
// this file (including retries) goes through scheduledEtherscanFetch(), which
// spaces out the START times of requests. It does NOT wait for earlier
// responses, so requests can still be in flight at the same time.

const ETHERSCAN_MIN_INTERVAL_MS = 550
let nextEtherscanStartAt = 0

// After an explicit rate-limit response, wait this long before the one retry.
const ETHERSCAN_RETRY_DELAY_MS = 1200

// DEV ONLY: used to print start times relative to the first request of a burst.
let burstStartedAt = 0

async function scheduledEtherscanFetch(url) {
  const now = Date.now()

  // Reserve a start slot. This runs with no `await` before it, so two
  // requests can never claim the same slot.
  const startAt = Math.max(now, nextEtherscanStartAt)
  nextEtherscanStartAt = startAt + ETHERSCAN_MIN_INTERVAL_MS

  const waitMs = startAt - now

  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs))
  }

  // DEV ONLY: log when the request actually starts (no URL, key or address).
  // A gap of more than 5 seconds since the last request begins a new burst.
  if (startAt - burstStartedAt > 5000) {
    burstStartedAt = startAt
  }
  console.log(`Etherscan request started +${startAt - burstStartedAt}ms`)

  return fetch(url)
}

// True only when Etherscan explicitly says we hit the rate limit.
// Etherscan reports this with HTTP 200, so we must inspect the JSON.
function isEtherscanRateLimit(data) {
  return (
    data?.status === '0' &&
    typeof data?.result === 'string' &&
    data.result.toLowerCase().includes('rate limit')
  )
}

// Schedule -> fetch -> parse JSON. If (and only if) Etherscan explicitly
// reports a rate limit, wait and retry ONCE through the scheduler again.
async function fetchEtherscanJson(url) {
  const firstResponse = await scheduledEtherscanFetch(url)
  const firstData = await firstResponse.json()

  if (!isEtherscanRateLimit(firstData)) {
    return firstData
  }

  console.log('Etherscan rate limited — retrying once')
  await new Promise((resolve) => setTimeout(resolve, ETHERSCAN_RETRY_DELAY_MS))

  // The retry also goes through the scheduler. No further retries after this.
  const retryResponse = await scheduledEtherscanFetch(url)
  return retryResponse.json()
}

// --- Health check ---------------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// --- Latest 5 normal transactions -----------------------------------------
// Kept for compatibility/debugging. The frontend's Analyze flow no longer
// calls it: the latest 5 now come from the first 5 records of /api/history.

app.get('/api/transactions/:address', async (req, res) => {
  const { address } = req.params

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address' })
  }

  const params = new URLSearchParams({
    chainid: '1',
    module: 'account',
    action: 'txlist',
    address,
    startblock: '0',
    endblock: '99999999',
    page: '1',
    offset: '5',
    sort: 'desc',
    apikey: ETHERSCAN_API_KEY,
  })

  try {
    const data = await fetchEtherscanJson(
      `https://api.etherscan.io/v2/api?${params}`,
    )

    // Etherscan can answer HTTP 200 with an error message in `result`,
    // so only an array counts as success.
    if (!Array.isArray(data.result)) {
      return res.status(502).json({ error: 'Unable to fetch transactions' })
    }

    const transactions = data.result.map((tx) => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      blockNumber: tx.blockNumber,
      timeStamp: tx.timeStamp,
      input: tx.input,
      methodId: tx.methodId,
      functionName: tx.functionName,
      contractAddress: tx.contractAddress,
    }))

    res.json(transactions)
  } catch (err) {
    res.status(500).json({ error: 'Unable to fetch transactions' })
  }
})

// --- First Observed Activity -----------------------------------------------
// The earliest activity visible across ALL five indexed activity families.
// This is NOT the wallet's key-creation time.

// The five families we ask about. Same shape for each, only the action differs.
const FIRST_OBSERVED_SOURCES = [
  { action: 'txlist', sourceType: 'normal', sourceLabel: 'Normal transaction' },
  { action: 'tokentx', sourceType: 'erc20', sourceLabel: 'ERC-20 transfer' },
  { action: 'tokennfttx', sourceType: 'erc721', sourceLabel: 'ERC-721 transfer' },
  { action: 'token1155tx', sourceType: 'erc1155', sourceLabel: 'ERC-1155 transfer' },
  { action: 'txlistinternal', sourceType: 'internal', sourceLabel: 'Internal transaction' },
]

// Etherscan reports "no data" as status 0 with a text message.
function isNoDataResponse(data) {
  const text = `${data?.message ?? ''} ${
    typeof data?.result === 'string' ? data.result : ''
  }`.toLowerCase()

  return text.includes('no transactions found') || text.includes('no records found')
}

// Asks Etherscan for the OLDEST single record of one family.
// Returns one candidate, or null if the wallet has none of that kind.
// THROWS on a real upstream failure (so we never report a possibly false date).
async function fetchOldestActivityCandidate({ action, sourceType, sourceLabel }, address) {
  const params = new URLSearchParams({
    chainid: '1',
    module: 'account',
    action,
    address,
    startblock: '0',
    endblock: '99999999',
    page: '1',
    offset: '1',
    sort: 'asc', // oldest first
    apikey: ETHERSCAN_API_KEY,
  })

  // Goes through the shared gateway: scheduled, rate-limit-aware, one retry.
  const data = await fetchEtherscanJson(`https://api.etherscan.io/v2/api?${params}`)

  if (!Array.isArray(data.result)) {
    if (isNoDataResponse(data)) {
      return null // legitimate: this wallet has none of this kind
    }

    // Safe to log: status/message/result only, never the URL or API key.
    console.error(`First-observed (${sourceType}) Etherscan error:`, {
      status: data.status,
      message: data.message,
      result: data.result,
    })
    throw new Error(`Etherscan failure for ${sourceType}`)
  }

  if (data.result.length === 0) {
    return null
  }

  const oldest = data.result[0]

  return {
    sourceType,
    sourceLabel,
    hash: oldest.hash,
    blockNumber: oldest.blockNumber,
    timeStamp: oldest.timeStamp,
  }
}

app.get('/api/first-observed/:address', async (req, res) => {
  const { address } = req.params

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address' })
  }

  try {
    // The five lookups are independent, so they all start now. They enter the
    // global scheduler, which spaces their Etherscan start times.
    // If ANY of them truly fails, Promise.all rejects and we return 502.
    const results = await Promise.all(
      FIRST_OBSERVED_SOURCES.map((source) =>
        fetchOldestActivityCandidate(source, address),
      ),
    )

    // null = this wallet has no activity of that kind. Not an error.
    const candidates = results.filter((candidate) => candidate !== null)

    if (candidates.length === 0) {
      return res.json({ firstObserved: null })
    }

    // Unix seconds fit safely in a JS number.
    const earliest = Math.min(...candidates.map((c) => Number(c.timeStamp)))

    // Keep EVERY source that ties at the earliest moment (explainability).
    const tied = candidates.filter((c) => Number(c.timeStamp) === earliest)

    res.json({
      firstObserved: {
        timeStamp: tied[0].timeStamp,
        hash: tied[0].hash,
        sourceType: tied[0].sourceType,
        sourceLabel: tied[0].sourceLabel,
        sources: tied.map((c) => ({
          sourceType: c.sourceType,
          sourceLabel: c.sourceLabel,
          hash: c.hash,
        })),
      },
    })
  } catch (err) {
    console.error('First-observed request failed:', err.message)
    res.status(502).json({ error: 'Unable to determine first observed activity' })
  }
})

// --- Historical normal-transaction dataset (for analysis, not UI) ---------

// Size of our initial normal-transaction analysis window.
const HISTORY_LIMIT = 1000

app.get('/api/history/:address', async (req, res) => {
  const { address } = req.params

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address' })
  }

  const params = new URLSearchParams({
    chainid: '1',
    module: 'account',
    action: 'txlist',
    address,
    startblock: '0',
    endblock: '99999999',
    page: '1',
    offset: String(HISTORY_LIMIT),
    sort: 'desc', // newest first, so we get the most RECENT window
    apikey: ETHERSCAN_API_KEY,
  })

  try {
    const data = await fetchEtherscanJson(
      `https://api.etherscan.io/v2/api?${params}`,
    )

    if (!Array.isArray(data.result)) {
      return res.status(502).json({ error: 'Unable to fetch transaction history' })
    }

    const transactions = data.result.map((tx) => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      blockNumber: tx.blockNumber,
      timeStamp: tx.timeStamp,
      input: tx.input,
      methodId: tx.methodId,
      functionName: tx.functionName,
      contractAddress: tx.contractAddress,
    }))

    res.json({
      transactions,
      requestedLimit: HISTORY_LIMIT,
      // Hitting the cap means older transactions MAY exist, not that they do.
      mayHaveMore: transactions.length >= HISTORY_LIMIT,
    })
  } catch (err) {
    res.status(500).json({ error: 'Unable to fetch transaction history' })
  }
})

// --- Historical ERC-20 transfer dataset (for analysis, not UI) ------------

// Size of our initial ERC-20 transfer analysis window.
const ERC20_LIMIT = 1000

app.get('/api/erc20-history/:address', async (req, res) => {
  const { address } = req.params

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address' })
  }

  const params = new URLSearchParams({
    chainid: '1',
    module: 'account',
    action: 'tokentx', // ERC-20 token transfer events
    address,
    startblock: '0',
    endblock: '99999999',
    page: '1',
    offset: String(ERC20_LIMIT),
    sort: 'desc', // newest first
    apikey: ETHERSCAN_API_KEY,
  })

  try {
    const data = await fetchEtherscanJson(
      `https://api.etherscan.io/v2/api?${params}`,
    )

    if (!Array.isArray(data.result)) {
      return res.status(502).json({ error: 'Unable to fetch ERC-20 history' })
    }

    // One record = one token transfer EVENT. The same `hash` can appear
    // several times, so we do NOT deduplicate by hash.
    // `value` and `tokenDecimal` stay as strings.
    const transfers = data.result.map((t) => ({
      hash: t.hash,
      blockNumber: t.blockNumber,
      timeStamp: t.timeStamp,
      from: t.from,
      to: t.to,
      contractAddress: t.contractAddress, // the TOKEN contract, not a recipient
      value: t.value,
      tokenName: t.tokenName,
      tokenSymbol: t.tokenSymbol,
      tokenDecimal: t.tokenDecimal,
      transactionIndex: t.transactionIndex,
      // May be missing from some responses; if so, left out of the JSON.
      methodId: t.methodId,
      functionName: t.functionName,
      statusRep: t.statusRep,
    }))

    res.json({
      transfers,
      requestedLimit: ERC20_LIMIT,
      mayHaveMore: transfers.length >= ERC20_LIMIT,
    })
  } catch (err) {
    res.status(500).json({ error: 'Unable to fetch ERC-20 history' })
  }
})

// --- Historical ERC-721 (NFT) transfer dataset (analysis, not UI) ---------

// Size of our initial ERC-721 transfer analysis window.
// Reduced from 1000 during debugging; kept at 200 for now.
const ERC721_LIMIT = 200

app.get('/api/erc721-history/:address', async (req, res) => {
  const { address } = req.params

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address' })
  }

  const params = new URLSearchParams({
    chainid: '1',
    module: 'account',
    action: 'tokennfttx', // ERC-721 transfer events
    address,
    startblock: '0',
    endblock: '99999999',
    page: '1',
    offset: String(ERC721_LIMIT),
    sort: 'desc', // newest first
    apikey: ETHERSCAN_API_KEY,
  })

  try {
    const data = await fetchEtherscanJson(
      `https://api.etherscan.io/v2/api?${params}`,
    )

    if (!Array.isArray(data.result)) {
      // Log only safe upstream information. Never the URL or the API key.
      console.error('ERC-721 Etherscan error:', {
        status: data.status,
        message: data.message,
        result: data.result,
      })

      // A legitimate "no NFT transfers" answer is a successful empty dataset.
      const text = `${data.message ?? ''} ${
        typeof data.result === 'string' ? data.result : ''
      }`.toLowerCase()

      if (text.includes('no transactions found') || text.includes('no records found')) {
        return res.json({
          transfers: [],
          requestedLimit: ERC721_LIMIT,
          mayHaveMore: false,
        })
      }

      return res.status(502).json({
        error: 'Unable to fetch ERC-721 history',
        upstream: {
          message: data.message,
          result: typeof data.result === 'string' ? data.result : undefined,
        },
      })
    }

    // One record = one NFT transfer EVENT. The same `hash` can appear several
    // times, so we do NOT deduplicate by hash. Zero-address from/to values
    // are kept untouched (mint/burn is interpreted later).
    const transfers = data.result.map((t) => ({
      hash: t.hash,
      blockNumber: t.blockNumber,
      timeStamp: t.timeStamp,
      from: t.from,
      to: t.to,
      contractAddress: t.contractAddress, // the NFT COLLECTION contract
      tokenID: t.tokenID, // which NFT inside the collection (string)
      tokenName: t.tokenName,
      tokenSymbol: t.tokenSymbol,
      transactionIndex: t.transactionIndex,
      // May be missing from some responses; if so, left out of the JSON.
      methodId: t.methodId,
      functionName: t.functionName,
    }))

    res.json({
      transfers,
      requestedLimit: ERC721_LIMIT,
      // Hitting the cap means older transfers MAY exist, not that they do.
      mayHaveMore: transfers.length >= ERC721_LIMIT,
    })
  } catch (err) {
    console.error('ERC-721 request failed:', err.message)
    res.status(500).json({ error: 'Unable to fetch ERC-721 history' })
  }
})

// --- Historical ERC-1155 (multi-token) transfer dataset (analysis, not UI) -

// Size of our initial ERC-1155 transfer analysis window.
const ERC1155_LIMIT = 200

app.get('/api/erc1155-history/:address', async (req, res) => {
  const { address } = req.params

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address' })
  }

  const params = new URLSearchParams({
    chainid: '1',
    module: 'account',
    action: 'token1155tx', // ERC-1155 transfer events
    address,
    startblock: '0',
    endblock: '99999999',
    page: '1',
    offset: String(ERC1155_LIMIT),
    sort: 'desc', // newest first
    apikey: ETHERSCAN_API_KEY,
  })

  try {
    // Same shared gateway as every other Etherscan request: scheduled,
    // rate-limit-aware, one retry.
    const data = await fetchEtherscanJson(
      `https://api.etherscan.io/v2/api?${params}`,
    )

    if (!Array.isArray(data.result)) {
      // Log only safe upstream information. Never the URL or the API key.
      console.error('ERC-1155 Etherscan error:', {
        status: data.status,
        message: data.message,
        result: data.result,
      })

      // A legitimate "no transfers" answer is a successful empty dataset.
      const text = `${data.message ?? ''} ${
        typeof data.result === 'string' ? data.result : ''
      }`.toLowerCase()

      if (text.includes('no transactions found') || text.includes('no records found')) {
        return res.json({
          transfers: [],
          requestedLimit: ERC1155_LIMIT,
          mayHaveMore: false,
        })
      }

      return res.status(502).json({ error: 'Unable to fetch ERC-1155 history' })
    }

    // One record = one ERC-1155 transfer entry. A batch transaction can
    // produce several records with the same `hash`, so we do NOT deduplicate
    // or combine them. tokenID and tokenValue stay as strings. Zero-address
    // from/to values are kept untouched (mint/burn is interpreted later).
    const transfers = data.result.map((t) => ({
      hash: t.hash,
      blockNumber: t.blockNumber,
      timeStamp: t.timeStamp,
      from: t.from,
      to: t.to,
      contractAddress: t.contractAddress, // the ERC-1155 contract
      tokenID: t.tokenID, // which token inside the contract
      tokenValue: t.tokenValue, // how many units of that token moved
      tokenName: t.tokenName,
      tokenSymbol: t.tokenSymbol,
      transactionIndex: t.transactionIndex,
      // May be missing from some responses; if so, left out of the JSON.
      methodId: t.methodId,
      functionName: t.functionName,
    }))

    res.json({
      transfers,
      requestedLimit: ERC1155_LIMIT,
      // Only means the returned count reached our configured limit.
      mayHaveMore: transfers.length >= ERC1155_LIMIT,
    })
  } catch (err) {
    console.error('ERC-1155 request failed:', err.message)
    res.status(500).json({ error: 'Unable to fetch ERC-1155 history' })
  }
})

// --- Historical internal-transaction dataset (for analysis, not UI) -------

// Size of our initial internal-transaction analysis window.
const INTERNAL_LIMIT = 1000

app.get('/api/internal-history/:address', async (req, res) => {
  const { address } = req.params

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address' })
  }

  const params = new URLSearchParams({
    chainid: '1',
    module: 'account',
    action: 'txlistinternal', // internal transactions (from execution traces)
    address,
    startblock: '0',
    endblock: '99999999',
    page: '1',
    offset: String(INTERNAL_LIMIT),
    sort: 'desc', // newest first
    apikey: ETHERSCAN_API_KEY,
  })

  try {
    // Same shared gateway as every other Etherscan request: scheduled,
    // rate-limit-aware, one retry.
    const data = await fetchEtherscanJson(
      `https://api.etherscan.io/v2/api?${params}`,
    )

    if (!Array.isArray(data.result)) {
      // Log only safe upstream information. Never the URL or the API key.
      console.error('Internal-tx Etherscan error:', {
        status: data.status,
        message: data.message,
        result: data.result,
      })

      // A legitimate "no internal transactions" answer is a successful
      // empty dataset.
      const text = `${data.message ?? ''} ${
        typeof data.result === 'string' ? data.result : ''
      }`.toLowerCase()

      if (text.includes('no transactions found') || text.includes('no records found')) {
        return res.json({
          transactions: [],
          requestedLimit: INTERNAL_LIMIT,
          mayHaveMore: false,
        })
      }

      return res.status(502).json({ error: 'Unable to fetch internal history' })
    }

    // One record = one internal operation. Several records can share one
    // `hash`; `traceId` tells them apart. We do NOT deduplicate or merge.
    // All numeric values stay as strings. Empty `to` / `contractAddress`
    // values are kept exactly as returned.
    const transactions = data.result.map((t) => ({
      blockNumber: t.blockNumber,
      timeStamp: t.timeStamp,
      hash: t.hash,
      from: t.from,
      to: t.to,
      value: t.value, // native ETH in wei
      contractAddress: t.contractAddress,
      input: t.input,
      type: t.type,
      gas: t.gas,
      gasUsed: t.gasUsed,
      traceId: t.traceId,
      isError: t.isError,
      errCode: t.errCode,
    }))

    res.json({
      transactions,
      requestedLimit: INTERNAL_LIMIT,
      // Only means the returned count reached our configured limit.
      mayHaveMore: transactions.length >= INTERNAL_LIMIT,
    })
  } catch (err) {
    console.error('Internal-tx request failed:', err.message)
    res.status(500).json({ error: 'Unable to fetch internal history' })
  }
})

// --- Etherscan emergency fallback for wallet data -------------------------

// One Etherscan V2 request, used only by the fallback route.
// It goes through fetchEtherscanJson, so it is scheduled and rate-limit-aware.
async function callEtherscan(params) {
  const query = new URLSearchParams({
    chainid: '1',
    ...params,
    apikey: ETHERSCAN_API_KEY, // stays on the server, never sent to React
  })

  return fetchEtherscanJson(`https://api.etherscan.io/v2/api?${query}`)
}

// Etherscan's "proxy" endpoints mirror Ethereum JSON-RPC. A good answer has a
// hex string in `result`. Errors (like rate limits) arrive with HTTP 200 but
// put a plain message in `result`, so we must check the shape ourselves.
function readHexResult(data) {
  if (typeof data.result !== 'string' || !/^0x[0-9a-fA-F]*$/.test(data.result)) {
    throw new Error('Unexpected Etherscan proxy response')
  }
  return data.result
}

app.get('/api/wallet-fallback/:address', async (req, res) => {
  const { address } = req.params

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address' })
  }

  try {
    // Requests run one after another (not Promise.all) inside this route.

    // Balance (wei, as a decimal string)
    const balanceData = await callEtherscan({
      module: 'account',
      action: 'balance',
      address,
      tag: 'latest',
    })

    if (balanceData.status !== '1' || !/^\d+$/.test(balanceData.result)) {
      throw new Error('Unexpected balance response')
    }

    // Nonce: eth_getTransactionCount at the latest block
    const nonceData = await callEtherscan({
      module: 'proxy',
      action: 'eth_getTransactionCount',
      address,
      tag: 'latest',
    })

    // Bytecode: eth_getCode at the latest block ("0x" means no code)
    const codeData = await callEtherscan({
      module: 'proxy',
      action: 'eth_getCode',
      address,
      tag: 'latest',
    })

    // Latest block number
    const blockData = await callEtherscan({
      module: 'proxy',
      action: 'eth_blockNumber',
    })

    // Normalize into JSON-safe values (BigInt cannot be sent as JSON).
    res.json({
      balanceWei: balanceData.result,
      nonce: Number(BigInt(readHexResult(nonceData))),
      bytecode: readHexResult(codeData),
      blockNumber: BigInt(readHexResult(blockData)).toString(),
    })
  } catch (err) {
    // Deliberately no error details: nothing sensitive can leak
    res.status(502).json({ error: 'Unable to fetch wallet fallback data' })
  }
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})