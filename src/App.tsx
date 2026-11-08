import { useState } from 'react'
import {
  createPublicClient,
  http,
  isAddress,
  formatEther,
} from 'viem'
import { mainnet } from 'viem/chains'
import './App.css'
import type { HistoryResponse, Transaction } from './types'
import { formatDateTime } from './utils'
import WalletSummary from './components/WalletSummary'
import ActivitySummary from './components/ActivitySummary'
import TransactionList from './components/TransactionList'

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
  blockNumber: string
}

type WalletDataSource = 'Primary RPC' | 'Backup RPC' | 'Etherscan fallback'

// --- Data helpers (unchanged) -------------------------------------------

// NORMALIZATION: every provider's raw answers pass through this one function,
// so they all end up as the same WalletData shape.
function buildWalletData(
  balanceWei: bigint,
  nonce: number,
  bytecode: string | undefined,
  blockNumber: bigint,
): WalletData {
  const isContract = Boolean(bytecode) && bytecode !== '0x'

  return {
    balance: formatEther(balanceWei),
    nonce,
    accountType: isContract ? 'Contract' : 'EOA',
    blockNumber: blockNumber.toString(),
  }
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
    BigInt(data.blockNumber),
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

// V2.7: the deeper analysis dataset (up to ~1000 normal transactions)
async function fetchHistory(address: string): Promise<HistoryResponse> {
  const response = await fetch(`http://localhost:3001/api/history/${address}`)

  if (!response.ok) {
    throw new Error('History request failed')
  }

  return response.json()
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
  // RECENT UI data: the latest 5 normal transactions shown as cards.
  // null = not loaded yet, [] = loaded but empty
  const [transactions, setTransactions] = useState<Transaction[] | null>(null)
  const [transactionError, setTransactionError] = useState('')
  // ANALYSIS data: up to ~1000 normal transactions, kept in memory, NEVER rendered.
  // null = not loaded yet
  const [normalTransactionHistory, setNormalTransactionHistory] =
    useState<Transaction[] | null>(null)
  // true if the window was full, so older transactions may exist
  const [historyMayHaveMore, setHistoryMayHaveMore] = useState(false)
  const [historyError, setHistoryError] = useState('')
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
    setBlockNumber(data.blockNumber)
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

  // V2.7: has its own try/catch, so a failure here cannot affect any other feature.
  async function loadHistory(validAddress: string) {
    try {
      const data = await fetchHistory(validAddress)
      setNormalTransactionHistory(data.transactions)
      setHistoryMayHaveMore(data.mayHaveMore)

      // DEV ONLY: inspect the array in the browser console. Safe to delete.
      console.log(
        `Historical normal transactions loaded: ${data.transactions.length}`,
        data.transactions,
      )
    } catch (err) {
      setHistoryError('Unable to load historical analysis data')
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
    setNormalTransactionHistory(null)
    setHistoryMayHaveMore(false)
    setHistoryError('')
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
      loadHistory(address),
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

  // DEV ONLY: a one-line summary of the hidden dataset (count + date range).
  // The records are sorted newest first, so [0] is newest and the last is oldest.
  let historySummary = ''
  if (normalTransactionHistory !== null) {
    const count = normalTransactionHistory.length
    if (count === 0) {
      historySummary = 'Historical analysis data: 0 normal transactions loaded'
    } else {
      const newest = new Date(Number(normalTransactionHistory[0].timeStamp) * 1000)
      const oldest = new Date(
        Number(normalTransactionHistory[count - 1].timeStamp) * 1000,
      )
      historySummary =
        `Historical analysis data: ${count} normal transactions loaded ` +
        `(${formatDateTime(oldest)} to ${formatDateTime(newest)})` +
        (historyMayHaveMore ? ' · window full, older transactions may exist' : '')
    }
  }

  // App.tsx owns the state and logic. Below, it only hands data
  // to presentation components through props.
  return (
    <main className="app">
      <header className="app-header">
        <h1>Wallet Intelligence</h1>
        <p className="subtitle">Enter an Ethereum address to inspect the wallet.</p>
      </header>

      <div className="search-row">
        <input
          className="address-input"
          type="text"
          placeholder="Ethereum address (0x...)"
          aria-label="Ethereum wallet address"
          spellCheck={false}
          autoComplete="off"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <button
          className="button-primary"
          type="button"
          onClick={handleAnalyze}
          disabled={loading}
        >
          {loading ? 'Analyzing...' : 'Analyze Wallet'}
        </button>
      </div>

      {error && (
        <p className="message message-error" role="alert">
          {error}
        </p>
      )}

      {analyzedAddress && (
        <>
          <WalletSummary
            address={analyzedAddress}
            balance={balance}
            nonce={nonce}
            accountType={accountType}
            blockNumber={blockNumber}
            dataSource={walletDataSource}
          />

          <ActivitySummary
            firstSeen={firstSeen}
            firstSeenChecked={firstSeenChecked}
            firstSeenError={firstSeenError}
            lastActive={lastActive}
          />

          <TransactionList
            transactions={transactions}
            transactionError={transactionError}
            analyzedAddress={analyzedAddress}
          />
        </>
      )}

      <footer className="dev-tools">
        <button className="button-secondary" type="button" onClick={handleCheckBackend}>
          Check Backend
        </button>
        {backendStatus && <span>Backend Status: {backendStatus}</span>}
        {/* DEV ONLY: remove these two lines when Wallet Orbit takes over */}
        {historySummary && <span>{historySummary}</span>}
        {historyError && <span>{historyError}</span>}
      </footer>
    </main>
  )
}

export default App