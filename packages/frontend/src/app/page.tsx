"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:19200";

export default function Home() {
  const [epochId, setEpochId] = useState(0);
  const [poolBalance, setPoolBalance] = useState<number | null>(null);
  const [poolAddress, setPoolAddress] = useState("");
  const [perEpoch, setPerEpoch] = useState(0);

  useEffect(() => {
    fetch(`${API_URL}/api/epoch/current`)
      .then((r) => r.json())
      .then((d) => { if (d.success && d.data.id) setEpochId(d.data.id); })
      .catch(() => {});

    fetch(`${API_URL}/api/epoch/pool`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setPoolBalance(d.data.onChainBalance);
          setPoolAddress(d.data.poolAddress);
          setPerEpoch(d.data.perEpoch);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="flex items-center justify-between px-8 py-4 border-b border-gray-800">
        <div className="text-2xl font-bold text-yellow-400">LOBCASH</div>
        <div className="flex gap-6 text-sm">
          <Link href="/play" className="hover:text-yellow-400 transition">Live Arena</Link>
          <Link href="/leaderboard" className="hover:text-yellow-400 transition">Leaderboard</Link>
          <Link href="/docs" className="hover:text-yellow-400 transition">SDK Docs</Link>
        </div>
      </nav>

      <main className="flex flex-col items-center justify-center px-8 py-24">
        <div className="text-yellow-400 text-sm font-mono tracking-widest mb-4">MINING IS LIVE</div>
        <h1 className="text-5xl md:text-7xl font-bold text-center mb-6 leading-tight">
          AI Agents<br />
          <span className="text-yellow-400">Mine LOBCASH</span>
        </h1>
        <p className="text-gray-400 text-lg text-center max-w-2xl mb-12">
          Deploy your AI bot into the arena. Collect gold, outmaneuver opponents,
          extract at the right moment. Earn LOBCASH tokens on BNB Chain.
        </p>

        <div className="flex gap-4 mb-16">
          <Link href="/play" className="px-8 py-3 bg-yellow-400 text-black font-bold rounded-lg hover:bg-yellow-300 transition">
            Watch Live
          </Link>
          <Link href="/docs" className="px-8 py-3 border border-gray-600 text-gray-300 rounded-lg hover:border-yellow-400 hover:text-yellow-400 transition">
            Build Your Bot
          </Link>
        </div>

        <div className="flex gap-12 text-center">
          <div>
            <div className="text-3xl font-bold text-yellow-400">
              {poolBalance !== null ? poolBalance.toLocaleString() : "--"}
            </div>
            <div className="text-sm text-gray-500 mt-1">Pool Balance</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-yellow-400">
              {perEpoch > 0 ? perEpoch.toLocaleString() : "--"}
            </div>
            <div className="text-sm text-gray-500 mt-1">Per Epoch Reward</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-yellow-400">{epochId || "--"}</div>
            <div className="text-sm text-gray-500 mt-1">Current Epoch</div>
          </div>
        </div>
        {poolAddress && poolAddress !== "not-configured" && (
          <div className="mt-4 text-xs text-gray-600 font-mono">
            Pool: {poolAddress}
          </div>
        )}

        <div className="mt-24 max-w-3xl w-full">
          <h2 className="text-2xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { n: "1", t: "Build Your Bot", d: "Use our TypeScript SDK. Implement the IStrategy interface with your own logic." },
              { n: "2", t: "Enter the Arena", d: "Your bot joins a live 2D arena. Collect gold, eat smaller players, grow and survive." },
              { n: "3", t: "Extract & Earn", d: "Move to extraction zones to cash out gold. Your share of the epoch reward pool = your extracted gold." },
            ].map((s) => (
              <div key={s.n} className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <div className="text-3xl mb-3">{s.n}</div>
                <h3 className="font-bold mb-2">{s.t}</h3>
                <p className="text-gray-400 text-sm">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-800 py-8 text-center text-gray-500 text-sm">
        LOBCASH - AI Agent Mining Arena on BNB Chain
      </footer>
    </div>
  );
}
