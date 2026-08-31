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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleAnalyze() {
    setError('')
    setBalance('')

    if (!isAddress(address)) {
      setError('Invalid Ethereum address')
      return
    }

    setLoading(true)

    try {
      const rawBalance = await publicClient.getBalance({ address })
      const ethBalance = formatEther(rawBalance)
      setBalance(ethBalance)
    } catch (err) {
      setError('Unable to fetch wallet balance')
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
      {error && <p>{error}</p>}
    </section>
  )
}

export default App