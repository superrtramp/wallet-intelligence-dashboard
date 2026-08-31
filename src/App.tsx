import { useState } from 'react'
import {
  createPublicClient,
  http,
  isAddress,
  formatEther,
} from 'viem'
import { mainnet } from 'viem/chains'

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
})

function App() {
  const [address, setAddress] = useState('')
  const [balance, setBalance] = useState('')
  const [transactionCount, setTransactionCount] = useState<number | null>(null)
  const [accountType, setAccountType] = useState('')
  const [blockNumber, setBlockNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleAnalyze() {
    setError('')
    setBalance('')
    setTransactionCount(null)
    setAccountType('')
    setBlockNumber('')

    if (!isAddress(address)) {
      setError('Invalid Ethereum address')
      return
    }

    setLoading(true)

    try {
      const [rawBalance, count, bytecode, block] = await Promise.all([
        publicClient.getBalance({ address }),
        publicClient.getTransactionCount({ address }),
        publicClient.getBytecode({ address }),
        publicClient.getBlockNumber(),
      ])

      const ethBalance = formatEther(rawBalance)
      setBalance(ethBalance)

      setTransactionCount(count)

      if (bytecode && bytecode !== '0x') {
        setAccountType('Contract')
      } else {
        setAccountType('EOA')
      }

      setBlockNumber(block.toString())
    } catch (err) {
      setError('Unable to fetch wallet data')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section id="center">
      <h1>Wallet Intelligence</h1>
      <p>Enter an Ethereum address to inspect the wallet.</p>
      <input
        type="text"
        placeholder="0x..."
        value={address}
        onChange={(e) => setAddress(e.target.value)}
      />
      <button type="button" onClick={handleAnalyze} disabled={loading}>
        {loading ? 'Analyzing...' : 'Analyze Wallet'}
      </button>
      {balance && <p>ETH Balance: {balance} ETH</p>}
      {transactionCount !== null && <p>Transaction Count: {transactionCount}</p>}
      {accountType && <p>Account Type: {accountType}</p>}
      {blockNumber && <p>Current Block: {blockNumber}</p>}
      {error && <p>{error}</p>}
    </section>
  )
}

export default App