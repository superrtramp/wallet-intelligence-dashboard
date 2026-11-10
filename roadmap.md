# Wallet Intelligence Dashboard — Roadmap

## Developed So Far

- **V0–V1:** Project setup, React, Vite, Viem, Ethereum RPC and Express backend.
- **V2.1:** Recent transaction history through Etherscan.
- **V2.2:** First Seen and Wallet Age.
- **V2.3:** Last Active.
- **V2.4:** Transaction direction (IN/OUT).
- **V2.4.1:** RPC failover, Etherscan fallback and data normalization.
- **V2.5:** Basic transaction type classification.
- **V2.6:** UI refactoring, reusable components and Etherscan links.
- **Historical Depth:** Up to ~1,000 normal transactions for analysis, pagination and `mayHaveMore`. Only five displayed.

## Next Development Steps

- **V2.7 — ERC-20 History:** Up to ~1,000 token transfer records (`tokentx`).
- **V2.7.1 — ERC-721 History:** NFT transfers (`tokennfttx`).
- **V2.7.2 — ERC-1155 History:** Multi-token transfers (`token1155tx`).
- **V2.7.3 — Internal ETH History:** Internal transfers (`txlistinternal`).
- **V2.7.4 — Unified Activity Model:**
  - Combine all five historical datasets.
  - Normalize records and prevent double-counting.
  - Distinguish actual token recipients from contract interactions.
  - Revisit **First Observed Activity** across all datasets and recalculate **Wallet Age**.
  - Preserve history completeness indicators.
- **V2.8 — Wallet Orbit:** Visualize wallet relationships, counterparties, transaction directions and asset movements using the unified activity model.

## Development Principles

- Reliable data before visualization.
- Keep historical datasets independently inspectable.
- Don't mistake partial history for complete history.
- Don't introduce unnecessary complexity without testing.
- Don't silently change agreed roadmap milestones.

**Next focus: ERC-20 transaction history.**