"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:19200";

interface Leader {
  id: number;
  nickname: string;
  balance: number;
  total_gold: number;
  total_tokens: number;
  epochs: number;
}

export default function LeaderboardPage() {
  const [leaders, setLeaders] = useState<Leader[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/api/leaderboard`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setLeaders(d.data); })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="flex items-center justify-between px-8 py-4 border-b border-gray-800">
        <Link href="/" className="text-2xl font-bold text-yellow-400">LOBCASH</Link>
        <div className="flex gap-6 text-sm">
          <Link href="/play" className="hover:text-yellow-400 transition">Live Arena</Link>
          <Link href="/leaderboard" className="text-yellow-400">Leaderboard</Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-8 py-12">
        <h1 className="text-3xl font-bold mb-8">Leaderboard</h1>

        <div className="bg-gray-900 rounded-xl border border-gray-800">
          <div className="grid grid-cols-5 gap-4 px-6 py-3 border-b border-gray-800 text-sm text-gray-500">
            <div>Rank</div>
            <div>Player</div>
            <div className="text-right">Gold Mined</div>
            <div className="text-right">Tokens Earned</div>
            <div className="text-right">Epochs</div>
          </div>

          {leaders.length === 0 && (
            <div className="px-6 py-12 text-center text-gray-600">
              No data yet. Start mining to appear here!
            </div>
          )}

          {leaders.map((l, i) => (
            <div key={l.id} className="grid grid-cols-5 gap-4 px-6 py-3 border-b border-gray-800/50 hover:bg-gray-800/30">
              <div className="font-mono text-yellow-400">{i + 1}</div>
              <div className="truncate">{l.nickname}</div>
              <div className="text-right font-mono text-gray-300">{l.total_gold.toFixed(0)}</div>
              <div className="text-right font-mono text-yellow-400">{l.total_tokens.toFixed(2)}</div>
              <div className="text-right text-gray-500">{l.epochs}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
