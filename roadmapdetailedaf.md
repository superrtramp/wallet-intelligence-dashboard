# Wallet Intelligence Dashboard — Development Roadmap

## Project Vision

Build a reliable Ethereum wallet intelligence application that transforms raw blockchain data into meaningful wallet activity, behavioral insights, and eventually an interactive network visualization called **Wallet Orbit**.

**Core development principle:** Build reliable data foundations before introducing advanced analytics or visualizations.

This is also a Build & Learn project. Prioritize understanding, correctness, and maintainable architecture over unnecessary complexity.

---

## Stage 1 — Historical Transaction Depth

**Foundation for V2.7 — Normal transaction history**

### Objective
Expand our existing normal transaction history beyond the five transactions shown in the interface.

### Implementation
- Use Etherscan V2 `txlist`.
- Implement proper pagination using `page` and `offset`.
- Initially validate retrieval with approximately 100–200 records.
- Support an initial analysis window of up to approximately **1,000 normal transaction records**.
- Keep displaying only five recent transactions in the main UI.
- Retain the larger historical array for analytics and future aggregation.
- Track retrieved record count and pagination metadata.
- Preserve `mayHaveMore` to indicate that additional records might exist.
- Never describe a partial dataset as complete history.

### Architectural principle
**Visible transaction history and analytical transaction history are different responsibilities.**

The UI doesn't need to render every record for the application to analyze them.

---

## Stage 2 — Token and Event Integration

Expand our historical intelligence using separate Etherscan endpoints.

Each dataset initially targets up to approximately 1,000 records, subject to API and pagination limitations.

### V2.7 — ERC-20 Transfer History

**Endpoint:** `tokentx`

Collect ERC-20 token transfer records.

Goals:
- Identify ERC-20 token movements.
- Capture sender, recipient, contract address, amount, token symbol and token decimals.
- Preserve transaction hashes and timestamps.
- Keep the ERC-20 dataset separate from normal transaction history.
- Track record count, pagination, and `mayHaveMore`.
- Do not claim to have complete token history when the dataset is limited.

### V2.7.1 — ERC-721 NFT Transfer History

**Endpoint:** `tokennfttx`

Collect ERC-721 NFT transfer records.

Goals:
- Identify NFT transfers.
- Preserve sender, recipient, contract address and token ID.
- Track NFT-related wallet activity.
- Keep records independently available for later integration.
- Preserve pagination and completeness indicators.

### V2.7.2 — ERC-1155 Transfer History

**Endpoint:** `token1155tx`

Collect ERC-1155 token transfer records.

Goals:
- Support ERC-1155 token transfers.
- Preserve token ID, quantity, sender, recipient and contract address.
- Handle multiple token-transfer records associated with a single blockchain transaction.
- Preserve pagination and completeness indicators.

### V2.7.3 — Internal ETH Transaction History

**Endpoint:** `txlistinternal`

Collect internal ETH movement records.

Goals:
- Identify ETH movements caused by smart contract execution.
- Capture internal sender, recipient and transferred ETH value.
- Improve accuracy when interpreting real fund flows.
- Keep internal ETH movements distinct from normal transactions.
- Preserve pagination and completeness indicators.

### Result of Stage 2

We will have five distinct historical activity sources:

| Dataset | Endpoint |
|---|---|
| Normal transactions | `txlist` |
| ERC-20 transfers | `tokentx` |
| ERC-721 transfers | `tokennfttx` |
| ERC-1155 transfers | `token1155tx` |
| Internal ETH movements | `txlistinternal` |

Each collection should remain independently inspectable before integration.

---

## Stage 3 — Unified Transaction Intelligence

### V2.7.4 — Unified Activity Model

**This is the most important architectural milestone before Wallet Orbit.**

### Objective

Combine our separate blockchain datasets into a consistent internal activity model that can accurately represent wallet interactions.

### 1. Data Normalization

Normalize records from different endpoints into a common structure.

Possible shared fields:

- Transaction hash
- Block number
- Timestamp
- Activity category
- Sender
- Recipient
- Asset or token contract
- Amount
- Source dataset
- Transaction status, when available
- Event identifier, when available

Not every activity type will contain every field. Preserve missing information explicitly rather than inventing values.

**Principle:** Different APIs may return different formats, but the analytical layer should receive consistent data structures.

### 2. Deduplication and Overlap Handling

A single Ethereum transaction may appear in multiple historical datasets.

We must:
- Identify transactions sharing the same hash.
- Distinguish blockchain transactions from individual transfer events.
- Avoid double-counting the same transaction in transaction-level metrics.
- Preserve distinct token-transfer events, even when they share a transaction hash.
- Use event-level identifiers where available.
- Preserve original raw records for verification.

**Important:** Deduplication must not accidentally delete legitimate separate token transfers.

### 3. Activity Classification

The unified model should distinguish:

- Native ETH movement
- ERC-20 token transfers
- ERC-721 NFT transfers
- ERC-1155 token transfers
- Contract interactions
- Internal ETH movements

These categories may overlap. A single transaction can produce multiple meaningful activities.

Do not assume every contract interaction is a transfer or that calldata proves an intended action succeeded.

### 4. Reconstruct Meaningful Transactions

Example:

Normal transaction:

`Alice → USDC Contract`

ERC-20 transfer event:

`Alice → Bob: 100 USDC`

The normal transaction identifies which contract Alice called.

The ERC-20 event identifies Bob as the actual token recipient.

Our unified model must preserve both facts rather than incorrectly treating the USDC contract as the economic recipient of the tokens.

**This is the core intelligence layer.**

### 5. First Observed Activity and Wallet Age

**Explicit reminder: Revisit this feature during V2.7.4.**

Currently, First Seen and Wallet Age are primarily based on the earliest normal transaction returned by Etherscan.

After integrating additional datasets:

- Identify the earliest known activity across normal transactions, ERC-20, ERC-721, ERC-1155 and internal ETH movements.
- Preserve the existing earliest-normal-transaction record as one candidate.
- Compare verified timestamps from available records.
- Calculate **First Observed Activity** from the earliest reliable activity identified.
- Recalculate **Wallet Age** using that date.
- Distinguish earliest observed activity from true account creation.
- If historical windows are incomplete, clearly communicate that earlier activity may exist.

Never silently describe a sampled dataset's earliest record as the wallet's definite first-ever activity.

### 6. Completeness and Source Transparency

Maintain:
- Record count per dataset
- Source endpoint
- Pagination status
- `mayHaveMore`
- Known data gaps and retrieval errors

Remember that `mayHaveMore = false` does not automatically prove complete historical coverage.

**V2.7.4 completion requirement:** The unified model must be internally consistent and avoid misleading transaction and token-flow representations before graph development begins.

---

## Stage 4 — Wallet Orbit

### V2.8 — Initial Wallet Orbit Visualization

**Begin only after V2.7.4 produces a trustworthy unified activity model.**

### Objective

Turn wallet activity into a visual network of meaningful blockchain relationships.

### Implementation

- Identify unique counterparties.
- Aggregate interactions between addresses.
- Calculate interaction counts.
- Aggregate asset movement by token and direction.
- Distinguish ETH movements, token transfers, NFT transfers and contract interactions.
- Represent addresses as nodes.
- Represent meaningful relationships as edges.
- Provide useful summaries and filtering.
- Clearly communicate incomplete historical coverage.

### Critical Rule

Do not build a graph that confuses contract calls with actual token recipients.

For example:

**Misleading graph:**

`Alice → USDC Contract`

**Meaningful token-transfer relationship:**

`Alice → Bob`

The graph may also separately represent Alice's interaction with the USDC contract, but it must not confuse that interaction with the token transfer.

**Correct data semantics come before visualization.**

---

## Engineering Principles and Reminders

### Separation of Concerns
Keep fetching, provider failover, normalization, analytical processing and UI rendering in clearly defined responsibilities.

### Failover
Use preferred data providers first. Attempt backup providers only when necessary, and stop after a valid result is obtained.

### Normalization
Different sources should produce consistent internal data structures.

### Deduplication
Prevent incorrect double-counting while preserving legitimate individual events.

### Rate-Limit Awareness
Etherscan Free has shown a practical limit of three requests per second in our testing. Account for this when introducing additional endpoint requests.

### Avoid Premature Engineering
**Don't solve hypothetical scaling problems until testing proves they exist.**

Avoid adding throttling, caching layers, queues or unnecessary abstractions without observed justification.

### Data Integrity
Distinguish:
- Raw blockchain records
- Derived analytical values
- Estimated or partially observed results
- Verified transaction outcomes

### Build & Learn
Understand why each architectural change is necessary. Prefer small, testable development steps instead of large unexplained implementations.

---

## Roadmap Summary

| Stage | Version | Main objective |
|---|---|---|
| 1 | Historical foundation | Expand normal transaction analysis depth |
| 2 | V2.7 | ERC-20 transfer history |
| 2 | V2.7.1 | ERC-721 NFT transfers |
| 2 | V2.7.2 | ERC-1155 transfers |
| 2 | V2.7.3 | Internal ETH transactions |
| 3 | V2.7.4 | Unified activity, normalization, deduplication, First Observed Activity and Wallet Age |
| 4 | V2.8 | Initial Wallet Orbit visualization |

These are development milestones, not declarations that the corresponding features are already completed. Implementation status must be verified against the code.

---

## Roadmap Governance

This file is the agreed development reference.

- Do not silently change established version numbering or feature scope.
- Distinguish proposed improvements from agreed requirements.
- Discuss meaningful architectural changes before modifying this roadmap.
- Keep deferred learning topics and architectural reminders attached to their relevant milestones.
- Update completion status only after implementation and testing.

**Guiding principle: Reliable data first. Meaningful intelligence second. Visualization third.**