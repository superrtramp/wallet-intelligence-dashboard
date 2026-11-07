import { useState } from 'react'
import {
  createPublicClient,
  http,
  isAddress,
  formatEther,
} from 'viem'
import { mainnet } from 'viem/chains'

// --- RPC configuration -------------------------------------------------
// Vite exposes only variables starting with VITE_ to frontend code.
// These values are shipped to the browser, so they are NOT secret.
const PRIMARY_RPC_URL = import.meta.env.VITE_PRIMARY_RPC_URL as string | undefined
const BACKUP_RPC_URL = import.meta.env.VITE_BACKUP_RPC_URL as string | undefined

function makeClient(rpcUrl: string | undefined) {
  return createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  })
}

// Two separate clients, one per provider. We try them manually, in order.
const primaryClient = makeClient(PRIMARY_RPC_URL)
const backupClient = makeClient(BACKUP_RPC_URL)

type RpcClient = ReturnType<typeof makeClient>

// --- Types -------------------------------------------------------------
type Transaction = {
  hash: string
  from: string
  to: string
  value: string
  blockNumber: string
  timeStamp: string
}

type FirstSeenResponse = {
  hash?: string
  blockNumber?: string
  timeStamp?: string
  firstSeen?: null
}

// The ONE shape the rest of the app uses, no matter which provider answered.
type WalletData = {
  balance: string // ETH, already formatted
  nonce: number
  accountType: 'EOA' | 'Contract'
  blockNumber: string | null
}

type WalletDataSource = 'Primary RPC' | 'Backup RPC' | 'Etherscan fallback'

// --- Helpers -----------------------------------------------------------
function shorten(text: string) {
  return `${text.slice(0, 6)}...${text.slice(-4)}`
}

// NORMALIZATION: every provider's raw answers pass through this one function,
// so they all end up as the same WalletData shape.
function buildWalletData(
  balanceWei: bigint,
  nonce: number,
  bytecode: string | undefined,
  blockNumber: bigint | null,
): WalletData {
  const isContract = Boolean(bytecode) && bytecode !== '0x'

  return {
    balance: formatEther(balanceWei),
    nonce,
    accountType: isContract ? 'Contract' : 'EOA',
blockNumber: blockNumber !== null ? blockNumber.toString() : null,  }
}

// Asks ONE viem client for the wallet info. The four calls are independent,
// so they run at the same time with Promise.all.
async function getWalletDataFromRpc(
  client: RpcClient,
  rpcUrl: string | undefined,
  address: `0x${string}`,
): Promise<WalletData> {
  // Without this check, http(undefined) would silently use viem's default
  // public RPC and hide a missing configuration.
  if (!rpcUrl) {
    throw new Error('RPC URL is not set')
  }

  const [balanceWei, nonce, bytecode, blockNumber] = await Promise.all([
    client.getBalance({ address }),
    client.getTransactionCount({ address }), // this is the account nonce
    client.getBytecode({ address }),
    client.getBlockNumber(),
  ])

  return buildWalletData(balanceWei, nonce, bytecode, blockNumber)
}

// Last resort: ask OUR backend, which asks Etherscan. The backend sends back
// plain strings (JSON cannot carry bigint), and we normalize them here.
async function getWalletDataFromEtherscanFallback(
  address: string,
): Promise<WalletData> {
  const response = await fetch(`http://localhost:3001/api/wallet-fallback/${address}`)

  if (!response.ok) {
    throw new Error('Wallet fallback request failed')
  }

  const data = await response.json()

  return buildWalletData(
    BigInt(data.balanceWei),
    Number(data.nonce),
    data.bytecode,
    null,
  )
}

async function fetchTransactions(address: string): Promise<Transaction[]> {
  const response = await fetch(`http://localhost:3001/api/transactions/${address}`)

  if (!response.ok) {
    throw new Error('Transaction request failed')
  }

  return response.json()
}

async function fetchFirstSeen(address: string): Promise<FirstSeenResponse> {
  const response = await fetch(`http://localhost:3001/api/first-seen/${address}`)

  if (!response.ok) {
    throw new Error('First seen request failed')
  }

  return response.json()
}

// Turns a start date into text like "3 years, 4 months", "7 months" or "12 days"
function formatWalletAge(startDate: Date) {
  const now = new Date()

  let years = now.getFullYear() - startDate.getFullYear()
  let months = now.getMonth() - startDate.getMonth()

  if (now.getDate() < startDate.getDate()) {
    months -= 1
  }

  if (months < 0) {
    years -= 1
    months += 12
  }

  if (years > 0) {
    const yearText = `${years} ${years === 1 ? 'year' : 'years'}`
    if (months === 0) {
      return yearText
    }
    return `${yearText}, ${months} ${months === 1 ? 'month' : 'months'}`
  }

  if (months > 0) {
    return `${months} ${months === 1 ? 'month' : 'months'}`
  }

  const msPerDay = 1000 * 60 * 60 * 24
  const days = Math.floor((now.getTime() - startDate.getTime()) / msPerDay)
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

// Turns a past date into text like "2 hours ago", "4 days ago" or "3 months ago"
function formatTimeAgo(pastDate: Date) {
  const seconds = Math.floor((Date.now() - pastDate.getTime()) / 1000)

  if (seconds < 60) {
    return 'just now'
  }

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  }

  const days = Math.floor(hours / 24)
  if (days < 30) {
    return `${days} ${days === 1 ? 'day' : 'days'} ago`
  }

  const months = Math.floor(days / 30)
  if (months < 12) {
    return `${months} ${months === 1 ? 'month' : 'months'} ago`
  }

  const years = Math.floor(days / 365)
  return `${years} ${years === 1 ? 'year' : 'years'} ago`
}

// Works out the searched wallet's role in a normal transaction.
// Addresses are lowercased first so letter case never affects the comparison.
function getTransactionDirection(tx: Transaction, walletAddress: string) {
  const wallet = walletAddress.toLowerCase()
  const from = tx.from.toLowerCase()
  const to = (tx.to || '').toLowerCase() // "to" can be empty for contract creation

  if (from === wallet && to === wallet) {
    return 'SELF'
  }

  if (from === wallet) {
    return 'OUT'
  }

  if (to === wallet) {
    return 'IN'
  }

  return 'UNKNOWN'
}

function App() {
  const [address, setAddress] = useState('')
  // The address that was actually analyzed (the input box can change afterwards)
  const [analyzedAddress, setAnalyzedAddress] = useState('')
  const [balance, setBalance] = useState('')
  const [nonce, setNonce] = useState<number | null>(null)
  const [accountType, setAccountType] = useState('')
  const [blockNumber, setBlockNumber] = useState('')
  // Which source actually supplied the wallet data ('' = none yet)
  const [walletDataSource, setWalletDataSource] = useState<WalletDataSource | ''>('')
  // null = not loaded yet, [] = loaded but empty
  const [transactions, setTransactions] = useState<Transaction[] | null>(null)
  const [transactionError, setTransactionError] = useState('')
  // null = not loaded yet
  const [firstSeen, setFirstSeen] = useState<Date | null>(null)
  const [firstSeenChecked, setFirstSeenChecked] = useState(false)
  const [firstSeenError, setFirstSeenError] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [backendStatus, setBackendStatus] = useState('')

  // Last Active comes from the newest transaction we already fetched.
  // The backend returns transactions newest first, so index 0 is the latest.
  const lastActive =
    transactions !== null && transactions.length > 0
      ? new Date(Number(transactions[0].timeStamp) * 1000)
      : null

  // Copies normalized wallet data into React state. It doesn't care
  // which provider produced the data, only which label to show.
  function showWalletData(data: WalletData, source: WalletDataSource) {
    setBalance(data.balance)
    setNonce(data.nonce)
    setAccountType(data.accountType)
    setBlockNumber(data.blockNumber ?? '')
    setWalletDataSource(source)
  }

  // FAILOVER: try each source in order. The first success returns immediately,
  // so later sources are never contacted. A failure is caught and we move on.
  async function loadWalletData(validAddress: `0x${string}`) {
    // 1. Primary RPC
    try {
      const data = await getWalletDataFromRpc(primaryClient, PRIMARY_RPC_URL, validAddress)
      showWalletData(data, 'Primary RPC')
      return
    } catch (err) {
      console.warn('Primary RPC failed, trying backup RPC', err)
    }

    // 2. Backup RPC
    try {
      const data = await getWalletDataFromRpc(backupClient, BACKUP_RPC_URL, validAddress)
      showWalletData(data, 'Backup RPC')
      return
    } catch (err) {
      console.warn('Backup RPC failed, trying Etherscan fallback', err)
    }

    // 3. Etherscan fallback through our backend
    try {
      const data = await getWalletDataFromEtherscanFallback(validAddress)
      showWalletData(data, 'Etherscan fallback')
      return
    } catch (err) {
      console.warn('Etherscan fallback failed', err)
    }

    // 4. Everything failed
    setError('Unable to fetch wallet data')
  }

  async function loadTransactions(validAddress: string) {
    try {
      const recentTransactions = await fetchTransactions(validAddress)
      setTransactions(recentTransactions)
    } catch (err) {
      setTransactionError('Unable to fetch transaction history')
    }
  }

  async function loadFirstSeen(validAddress: string) {
    try {
      const data = await fetchFirstSeen(validAddress)

      if (data.timeStamp) {
        setFirstSeen(new Date(Number(data.timeStamp) * 1000))
      }

      setFirstSeenChecked(true)
    } catch (err) {
      setFirstSeenError('Unable to fetch wallet age')
    }
  }

  async function handleAnalyze() {
    setError('')
    setBalance('')
    setNonce(null)
    setAccountType('')
    setBlockNumber('')
    setWalletDataSource('')
    setTransactions(null)
    setTransactionError('')
    setFirstSeen(null)
    setFirstSeenChecked(false)
    setFirstSeenError('')
    setAnalyzedAddress('')

    if (!isAddress(address)) {
      setError('Invalid Ethereum address')
      return
    }

    setAnalyzedAddress(address)
    setLoading(true)

    // Each function handles its own errors, so one failing
    // does not break the others. They still run at the same time.
    await Promise.all([
      loadWalletData(address),
      loadTransactions(address),
      loadFirstSeen(address),
    ])

    setLoading(false)
  }

  async function handleCheckBackend() {
    setBackendStatus('')

    try {
      const response = await fetch('http://localhost:3001/api/health')
      const data = await response.json()

      if (data.status === 'ok') {
        setBackendStatus('Connected')
      } else {
        setBackendStatus('Unavailable')
      }
    } catch (err) {
      setBackendStatus('Unavailable')
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
      {nonce !== null && <p>Nonce: {nonce}</p>}
      {accountType && <p>Account Type: {accountType}</p>}
      {blockNumber && <p>Current Block: {blockNumber}</p>}
      {walletDataSource && <p>Data Source: {walletDataSource}</p>}
      {error && <p>{error}</p>}

      {firstSeen && (
        <>
          <p>First Seen: {firstSeen.toLocaleString()}</p>
          <p>Wallet Age: {formatWalletAge(firstSeen)}</p>
        </>
      )}

      {firstSeenChecked && !firstSeen && (
        <p>First Seen: No transaction history found</p>
      )}

      {firstSeenError && <p>{firstSeenError}</p>}

      {lastActive && (
        <>
          <p>Last Active: {lastActive.toLocaleString()}</p>
          <p>Last Active: {formatTimeAgo(lastActive)}</p>
        </>
      )}

      {transactionError && <p>{transactionError}</p>}

      {transactions !== null && transactions.length === 0 && (
        <p>No recent transactions found</p>
      )}

      {transactions !== null && transactions.length > 0 && (
        <div>
          <h2>Recent Transactions</h2>
          {transactions.map((tx) => (
            <p key={tx.hash}>
              {getTransactionDirection(tx, analyzedAddress)} | Hash:{' '}
              {shorten(tx.hash)} | From: {shorten(tx.from)} | To:{' '}
              {tx.to ? shorten(tx.to) : 'Contract Creation'} | Value:{' '}
              {formatEther(BigInt(tx.value))} ETH |{' '}
              {new Date(Number(tx.timeStamp) * 1000).toLocaleString()}
            </p>
          ))}
        </div>
      )}

      <button type="button" onClick={handleCheckBackend}>
        Check Backend
      </button>
      {backendStatus && <p>Backend Status: {backendStatus}</p>}
    </section>
  )
}

export default App