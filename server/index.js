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

    const transactions = data.result.map((tx) => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      blockNumber: tx.blockNumber,
      timeStamp: tx.timeStamp,
    }))

    res.json(transactions)
  } catch (err) {
    res.status(500).json({ error: 'Unable to fetch transactions' })
  }
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})