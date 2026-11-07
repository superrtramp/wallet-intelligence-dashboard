import type { Transaction } from './types'

export function shorten(text: string) {
  return `${text.slice(0, 6)}...${text.slice(-4)}`
}

// Example: "07 Nov 2026 · 16:14" (in the user's local time zone)
export function formatDateTime(date: Date) {
  const day = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const time = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${day} · ${time}`
}


// Turns a start date into text like "3 years, 4 months", "7 months" or "12 days"
export function formatWalletAge(startDate: Date) {
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
export function formatTimeAgo(pastDate: Date) {
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

// DIRECTION: the searched wallet's role in a normal transaction.
// Addresses are lowercased first so letter case never affects the comparison.
export function getTransactionDirection(tx: Transaction, walletAddress: string) {
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

// TYPE: what kind of transaction structure this is. Kept separate from
// direction on purpose. These are conservative heuristics based on the
// transaction's own fields, not proof of application-level intent.
export function getTransactionType(tx: Transaction) {
  // Rule 1: no "to" address means the transaction deploys a new contract
  if (!tx.to) {
    return 'Contract Creation'
  }

  // Rule 2: non-empty calldata strongly suggests a contract interaction
  if (tx.input !== '0x') {
    return 'Contract Interaction'
  }

  // Rules 3 and 4: empty calldata, so decide by the ETH value (in wei)
  if (BigInt(tx.value) > 0n) {
    return 'ETH Transfer'
  }

  return 'Zero-value Transaction'
}

// Optional extra detail for Contract Interaction, using data Etherscan
// already gave us. No ABI decoding and no extra API calls.
export function getFunctionInfo(tx: Transaction) {
  if (tx.functionName) {
    return tx.functionName
  }

  if (tx.methodId && tx.methodId !== '0x') {
    return `Method: ${tx.methodId}`
  }

  return ''
}

// Etherscan links are just URLs built from data we already have.
// No API request is involved.
export function etherscanAddressUrl(address: string) {
  return `https://etherscan.io/address/${address}`
}

export function etherscanTxUrl(hash: string) {
  return `https://etherscan.io/tx/${hash}`
}