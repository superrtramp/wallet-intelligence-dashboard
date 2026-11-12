import type { Activity, ActivitySourceType } from './types'

// How many of the newest Activity records the Orbit shows. This only limits
// what is DRAWN. It does not change any API limit or fetch anything.
export const ORBIT_ACTIVITY_LIMIT = 25

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export type OrbitDirection = 'IN' | 'OUT' | 'SELF' | 'UNKNOWN'

// One orbit item = ONE activity record. We deliberately do not aggregate
// counterparties yet.
export type OrbitItem = {
  id: string
  sourceType: ActivitySourceType
  sourceLabel: string
  hash: string
  timeStamp: string
  from: string
  to: string
  direction: OrbitDirection
  // The address on the other side, or null when none can be determined.
  counterparty: string | null
  // Minimal explanation when the counterparty is missing or not a real party.
  note: string
}

// Direction relative to the analyzed wallet. Comparisons are case-insensitive.
function getDirection(activity: Activity, wallet: string): OrbitDirection {
  const w = wallet.toLowerCase()
  const from = activity.from.toLowerCase()
  const to = (activity.to || '').toLowerCase()

  if (from === w && to === w) return 'SELF'
  if (from === w) return 'OUT'
  if (to === w) return 'IN'
  return 'UNKNOWN'
}

// Turns the newest Activity records into orbit items. Pure: no fetching.
// It uses each activity's real from/to, so an ERC-20 item points at the token
// receiver (Bob), never at the token contract.
export function buildOrbitItems(
  activities: Activity[],
  wallet: string,
  limit: number = ORBIT_ACTIVITY_LIMIT,
): OrbitItem[] {
  return activities.slice(0, limit).map((activity, index) => {
    const direction = getDirection(activity, wallet)

    const other =
      direction === 'OUT' ? activity.to : direction === 'IN' ? activity.from : ''

    let counterparty: string | null = null
    let note = ''

    if (!other) {
      // Empty address: do not invent a counterparty.
      if (direction === 'OUT') note = 'No recipient (e.g. contract creation)'
      if (direction === 'SELF') note = 'Wallet to itself'
      if (direction === 'UNKNOWN') note = 'Wallet not found in from/to'
    } else if (other.toLowerCase() === ZERO_ADDRESS) {
      // Zero address is not a normal counterparty.
      note =
        direction === 'IN'
          ? 'Zero-address sender (mint/system)'
          : 'Zero-address recipient (burn/system)'
    } else {
      counterparty = other
    }

    return {
      id: `${index}-${activity.sourceType}-${activity.hash}`,
      sourceType: activity.sourceType,
      sourceLabel: activity.sourceLabel,
      hash: activity.hash,
      timeStamp: activity.timeStamp,
      from: activity.from,
      to: activity.to,
      direction,
      counterparty,
      note,
    }
  })
}