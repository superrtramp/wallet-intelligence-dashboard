import 'dotenv/config'
import express from 'express'
import cors from 'cors'

const app = express()
const PORT = 3001
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY

app.use(cors({ origin: 'http://localhost:5173' }))

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.get('/api/transactions/:address', async (req, res) => {
  const { address } = req.params

  // Basic check so we don't waste an Etherscan request on a bad address
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
    const response = await fetch(`https://api.etherscan.io/v2/api?${params}`)
    const data = await response.json()

    // Etherscan returns an array on success (or on "no transactions found")
    if (!Array.isArray(data.result)) {
      return res.status(502).json({ error: 'Unable to fetch transactions' })
    }

    // Same single request as before. We just keep more of the fields
    // Etherscan already sent us, instead of discarding them.
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

app.get('/api/first-seen/:address', async (req, res) => {
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
    offset: '1',
    sort: 'asc',
    apikey: ETHERSCAN_API_KEY,
  })

  try {
    const response = await fetch(`https://api.etherscan.io/v2/api?${params}`)
    const data = await response.json()

    // Etherscan returns an array on success (empty if no transactions)
    if (!Array.isArray(data.result)) {
      return res.status(502).json({ error: 'Unable to fetch first seen data' })
    }

    if (data.result.length === 0) {
      return res.json({ firstSeen: null })
    }

    const firstTx = data.result[0]

    res.json({
      hash: firstTx.hash,
      blockNumber: firstTx.blockNumber,
      timeStamp: firstTx.timeStamp,
    })
  } catch (err) {
    res.status(500).json({ error: 'Unable to fetch first seen data' })
  }
})

// --- V2.7: historical normal-transaction dataset (for analysis, not UI) ---

// The size of our analysis window. Etherscan allows page * offset <= 10,000,
// so one request with offset=1000 is allowed. The backend owns this number.
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
    const response = await fetch(`https://api.etherscan.io/v2/api?${params}`)
    const data = await response.json()

    // Errors such as a rate limit arrive with HTTP 200 and a text `result`,
    // so we check the shape ourselves. An empty array is valid (no history).
    if (!Array.isArray(data.result)) {
      return res.status(502).json({ error: 'Unable to fetch transaction history' })
    }

    // Keep the raw fields future relationship analysis will need.
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
      // If we got a full window, the wallet may have older transactions we
      // did not fetch. This is NOT proof there are more, only that we hit the cap.
      mayHaveMore: transactions.length >= HISTORY_LIMIT,
    })
  } catch (err) {
    res.status(500).json({ error: 'Unable to fetch transaction history' })
  }
})

// --- V2.4.1: Etherscan emergency fallback for wallet data ---------------

// Small helper used only by the fallback route: one Etherscan V2 request.
async function callEtherscan(params) {
  const query = new URLSearchParams({
    chainid: '1',
    ...params,
    apikey: ETHERSCAN_API_KEY, // stays on the server, never sent to React
  })

  const response = await fetch(`https://api.etherscan.io/v2/api?${query}`)

  if (!response.ok) {
    throw new Error('Etherscan HTTP error')
  }

  return response.json()
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
    // Requests run one after another (not Promise.all) to stay gentle on
    // Etherscan's per-second rate limit; the app may also be calling
    // /transactions and /first-seen at the same moment.

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

    // NORMALIZE: convert everything into plain JSON-safe values.
    // (BigInt cannot be sent as JSON, so big numbers travel as strings.)
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