import { useState } from 'react'

function App() {
  const [address, setAddress] = useState('')

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
      <button type="button">Analyze Wallet</button>
    </section>
  )
}

export default App
