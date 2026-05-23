import { useState, useEffect, useCallback, useRef } from "react";

// ─── CONSTANTS ───
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const HAND_NAMES = ["High Card","One Pair","Two Pair","Three of a Kind","Straight","Flush","Full House","Four of a Kind","Straight Flush","Royal Flush"];
const AI_NAMES = ["Ronin_X","ShadowBlade","VoidWalker","CircuitSensei","NeonShogun","StormCaster"];
const STARTING_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;

// ─── CARD UTILITIES ───
function createDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit, rank });
  return shuffle([...deck]);
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function rankValue(r) { return RANKS.indexOf(r); }
function isRed(suit) { return suit === "♥" || suit === "♦"; }

// ─── HAND EVALUATION ───
function evaluateHand(cards) {
  if (cards.length < 5) return { rank: 0, name: "High Card", best: cards };
  const allCombos = getCombinations(cards, 5);
  let bestResult = { rank: 0, tiebreaker: [], name: "High Card", best: cards.slice(0,5) };
  for (const combo of allCombos) {
    const result = evaluate5(combo);
    if (result.rank > bestResult.rank || (result.rank === bestResult.rank && compareTiebreaker(result.tiebreaker, bestResult.tiebreaker) > 0)) {
      bestResult = { ...result, best: combo };
    }
  }
  return bestResult;
}
function getCombinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];
  const [first, ...rest] = arr;
  const withFirst = getCombinations(rest, k - 1).map(c => [first, ...c]);
  const without = getCombinations(rest, k);
  return [...withFirst, ...without];
}
function evaluate5(cards) {
  const vals = cards.map(c => rankValue(c.rank)).sort((a,b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);
  const unique = [...new Set(vals)].sort((a,b) => b - a);
  const isStraight = unique.length === 5 && unique[0] - unique[4] === 4;
  const isLowStraight = unique.length === 5 && unique.join(",") === "12,3,2,1,0";
  const counts = {};
  vals.forEach(v => counts[v] = (counts[v]||0) + 1);
  const groups = Object.entries(counts).sort((a,b) => b[1]-a[1] || b[0]-a[0]);
  
  if (isFlush && isStraight && vals[0] === 12) return { rank: 9, tiebreaker: vals, name: "Royal Flush" };
  if (isFlush && (isStraight || isLowStraight)) return { rank: 8, tiebreaker: isLowStraight ? [3] : [vals[0]], name: "Straight Flush" };
  if (groups[0][1] === 4) return { rank: 7, tiebreaker: [+groups[0][0], +groups[1][0]], name: "Four of a Kind" };
  if (groups[0][1] === 3 && groups[1][1] === 2) return { rank: 6, tiebreaker: [+groups[0][0], +groups[1][0]], name: "Full House" };
  if (isFlush) return { rank: 5, tiebreaker: vals, name: "Flush" };
  if (isStraight) return { rank: 4, tiebreaker: [vals[0]], name: "Straight" };
  if (isLowStraight) return { rank: 4, tiebreaker: [3], name: "Straight" };
  if (groups[0][1] === 3) return { rank: 3, tiebreaker: [+groups[0][0], ...vals.filter(v => v !== +groups[0][0])], name: "Three of a Kind" };
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = [+groups[0][0], +groups[1][0]].sort((a,b) => b-a);
    const kicker = vals.find(v => v !== pairs[0] && v !== pairs[1]);
    return { rank: 2, tiebreaker: [...pairs, kicker], name: "Two Pair" };
  }
  if (groups[0][1] === 2) return { rank: 1, tiebreaker: [+groups[0][0], ...vals.filter(v => v !== +groups[0][0])], name: "One Pair" };
  return { rank: 0, tiebreaker: vals, name: "High Card" };
}
function compareTiebreaker(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}

// ─── STYLES ───
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Rajdhani:wght@300;400;500;600;700&family=Share+Tech+Mono&display=swap');

:root {
  --bg-dark: #0a0a0a;
  --bg-card: #111111;
  --red-primary: #dc2626;
  --red-glow: #ef4444;
  --red-deep: #991b1b;
  --red-dim: #7f1d1d;
  --gold: #f59e0b;
  --text-primary: #f5f5f5;
  --text-secondary: #a3a3a3;
  --text-dim: #525252;
  --green-felt: #0d3320;
  --green-felt-light: #15503a;
  --circuit-red: rgba(220, 38, 38, 0.15);
}

* { margin:0; padding:0; box-sizing:border-box; }

body {
  background: var(--bg-dark);
  color: var(--text-primary);
  font-family: 'Rajdhani', sans-serif;
  overflow-x: hidden;
}

.app-container {
  min-height: 100vh;
  background: var(--bg-dark);
  position: relative;
}

/* Circuit board background pattern */
.circuit-bg {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background:
    linear-gradient(90deg, transparent 49.5%, var(--circuit-red) 49.5%, var(--circuit-red) 50.5%, transparent 50.5%) 0 0 / 60px 60px,
    linear-gradient(0deg, transparent 49.5%, var(--circuit-red) 49.5%, var(--circuit-red) 50.5%, transparent 50.5%) 0 0 / 60px 60px,
    radial-gradient(circle 2px, rgba(220,38,38,0.3) 100%, transparent 100%) 0 0 / 60px 60px;
  pointer-events: none;
  z-index: 0;
  opacity: 0.4;
}

/* ─── LOGIN SCREEN ─── */
.login-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  position: relative;
  z-index: 1;
  padding: 20px;
}

.login-logo {
  font-family: 'Orbitron', sans-serif;
  font-size: clamp(28px, 6vw, 52px);
  font-weight: 900;
  color: var(--text-primary);
  text-shadow: 0 0 30px var(--red-primary), 0 0 60px rgba(220,38,38,0.4);
  letter-spacing: 4px;
  margin-bottom: 8px;
}
.login-logo span { color: var(--red-primary); }

.login-subtitle {
  font-family: 'Rajdhani', sans-serif;
  font-size: clamp(12px, 2.5vw, 16px);
  color: var(--red-primary);
  letter-spacing: 6px;
  text-transform: uppercase;
  margin-bottom: 48px;
  opacity: 0.8;
}

.login-box {
  background: linear-gradient(135deg, rgba(17,17,17,0.95), rgba(30,10,10,0.95));
  border: 1px solid var(--red-dim);
  border-radius: 2px;
  padding: 40px;
  width: 100%;
  max-width: 420px;
  position: relative;
  overflow: hidden;
}
.login-box::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--red-primary), transparent);
}

.login-box h2 {
  font-family: 'Orbitron', sans-serif;
  font-size: 14px;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: var(--red-primary);
  margin-bottom: 24px;
}

.login-input {
  width: 100%;
  padding: 14px 16px;
  background: rgba(0,0,0,0.6);
  border: 1px solid var(--red-dim);
  border-radius: 2px;
  color: var(--text-primary);
  font-family: 'Share Tech Mono', monospace;
  font-size: 14px;
  margin-bottom: 16px;
  outline: none;
  transition: border-color 0.3s;
}
.login-input:focus { border-color: var(--red-primary); box-shadow: 0 0 10px rgba(220,38,38,0.2); }
.login-input::placeholder { color: var(--text-dim); }

.login-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, var(--red-deep), var(--red-primary));
  border: 1px solid var(--red-primary);
  border-radius: 2px;
  color: var(--text-primary);
  font-family: 'Orbitron', sans-serif;
  font-size: 13px;
  letter-spacing: 3px;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.3s;
  position: relative;
  overflow: hidden;
}
.login-btn:hover { box-shadow: 0 0 20px rgba(220,38,38,0.5); transform: translateY(-1px); }
.login-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ─── NAV ─── */
.top-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: rgba(10,10,10,0.95);
  border-bottom: 1px solid var(--red-dim);
  position: relative;
  z-index: 10;
  flex-wrap: wrap;
  gap: 8px;
}
.nav-brand {
  font-family: 'Orbitron', sans-serif;
  font-size: clamp(14px, 3vw, 20px);
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: 2px;
}
.nav-brand span { color: var(--red-primary); }

.nav-tabs {
  display: flex;
  gap: 4px;
}
.nav-tab {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 2px;
  color: var(--text-secondary);
  font-family: 'Rajdhani', sans-serif;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.3s;
}
.nav-tab:hover { color: var(--red-primary); }
.nav-tab.active {
  color: var(--red-primary);
  border-color: var(--red-dim);
  background: rgba(220,38,38,0.1);
}

.nav-user {
  display: flex;
  align-items: center;
  gap: 12px;
}
.nav-chips {
  font-family: 'Share Tech Mono', monospace;
  font-size: 14px;
  color: var(--gold);
}
.nav-email {
  font-family: 'Share Tech Mono', monospace;
  font-size: 11px;
  color: var(--text-dim);
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nav-logout {
  padding: 6px 12px;
  background: transparent;
  border: 1px solid var(--red-dim);
  border-radius: 2px;
  color: var(--text-dim);
  font-size: 11px;
  font-family: 'Rajdhani', sans-serif;
  cursor: pointer;
  transition: all 0.3s;
}
.nav-logout:hover { color: var(--red-primary); border-color: var(--red-primary); }

/* ─── TABLE ─── */
.game-area {
  position: relative;
  z-index: 1;
  padding: 16px;
  min-height: calc(100vh - 56px);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.poker-table {
  width: 100%;
  max-width: 900px;
  background: radial-gradient(ellipse at center, var(--green-felt-light), var(--green-felt), #091a12);
  border: 3px solid var(--red-dim);
  border-radius: 180px;
  padding: clamp(20px, 4vw, 40px) clamp(16px, 3vw, 30px);
  position: relative;
  box-shadow: 0 0 40px rgba(220,38,38,0.15), inset 0 0 60px rgba(0,0,0,0.4);
  margin: 16px 0;
}
.poker-table::before {
  content: '';
  position: absolute;
  top: 6px; left: 6px; right: 6px; bottom: 6px;
  border: 1px solid rgba(220,38,38,0.2);
  border-radius: 174px;
  pointer-events: none;
}

/* Community cards */
.community-area {
  text-align: center;
  margin: 16px 0;
}
.community-label {
  font-family: 'Orbitron', sans-serif;
  font-size: 10px;
  letter-spacing: 3px;
  color: rgba(255,255,255,0.3);
  text-transform: uppercase;
  margin-bottom: 8px;
}
.community-cards {
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* Pot */
.pot-display {
  text-align: center;
  margin: 12px 0;
}
.pot-amount {
  font-family: 'Orbitron', sans-serif;
  font-size: clamp(18px, 4vw, 28px);
  font-weight: 700;
  color: var(--gold);
  text-shadow: 0 0 15px rgba(245,158,11,0.4);
}
.pot-label {
  font-size: 10px;
  letter-spacing: 3px;
  color: var(--text-dim);
  text-transform: uppercase;
}

/* AI Players */
.ai-players {
  display: flex;
  justify-content: center;
  gap: clamp(8px, 2vw, 16px);
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.ai-seat {
  text-align: center;
  min-width: 80px;
}
.ai-name {
  font-family: 'Share Tech Mono', monospace;
  font-size: 10px;
  color: var(--text-secondary);
  margin-bottom: 4px;
  white-space: nowrap;
}
.ai-name.folded { color: var(--text-dim); text-decoration: line-through; }
.ai-name.active-player { color: var(--red-primary); }
.ai-chips-display {
  font-family: 'Share Tech Mono', monospace;
  font-size: 10px;
  color: var(--gold);
  opacity: 0.7;
}
.ai-cards {
  display: flex;
  gap: 3px;
  justify-content: center;
  margin-top: 4px;
}
.ai-bet-amount {
  font-family: 'Share Tech Mono', monospace;
  font-size: 10px;
  color: var(--red-primary);
  margin-top: 2px;
}
.ai-hand-result {
  font-family: 'Rajdhani', sans-serif;
  font-size: 10px;
  color: var(--gold);
  margin-top: 2px;
  font-weight: 600;
}

/* Player area */
.player-area {
  text-align: center;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(220,38,38,0.15);
}
.player-hand {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 8px;
}
.player-hand-name {
  font-family: 'Orbitron', sans-serif;
  font-size: 12px;
  color: var(--gold);
  letter-spacing: 2px;
  margin-bottom: 4px;
}
.player-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 8px;
}
.player-chip-count {
  font-family: 'Orbitron', sans-serif;
  font-size: 16px;
  color: var(--gold);
}

/* Cards */
.card {
  width: clamp(42px, 8vw, 58px);
  height: clamp(60px, 11vw, 82px);
  border-radius: 5px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: 'Share Tech Mono', monospace;
  font-weight: 700;
  position: relative;
  transition: transform 0.3s, box-shadow 0.3s;
}
.card-face {
  background: linear-gradient(145deg, #fafafa, #e5e5e5);
  border: 1px solid #ccc;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.card-face .card-rank {
  font-size: clamp(14px, 3vw, 20px);
  line-height: 1;
}
.card-face .card-suit {
  font-size: clamp(12px, 2.5vw, 18px);
  line-height: 1;
}
.card-face.red { color: var(--red-primary); }
.card-face.black { color: #1a1a1a; }

.card-back {
  background: linear-gradient(135deg, var(--red-deep), #1a0505);
  border: 1px solid var(--red-dim);
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
}
.card-back::after {
  content: '武';
  font-family: serif;
  font-size: clamp(16px, 3vw, 24px);
  color: rgba(220,38,38,0.3);
}

.card-small {
  width: 32px;
  height: 46px;
}
.card-small .card-rank { font-size: 11px; }
.card-small .card-suit { font-size: 10px; }
.card-small.card-back::after { font-size: 14px; }

/* ─── CONTROLS ─── */
.controls-bar {
  width: 100%;
  max-width: 900px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px 0;
}

.ctrl-btn {
  padding: 10px 20px;
  border-radius: 2px;
  font-family: 'Orbitron', sans-serif;
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid;
  min-width: 80px;
}
.ctrl-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.btn-fold {
  background: rgba(80,80,80,0.3);
  border-color: #555;
  color: var(--text-secondary);
}
.btn-fold:hover:not(:disabled) { background: rgba(80,80,80,0.5); }

.btn-check {
  background: rgba(20,80,40,0.4);
  border-color: #2d6a4f;
  color: #52b788;
}
.btn-check:hover:not(:disabled) { background: rgba(20,80,40,0.6); }

.btn-call {
  background: rgba(30,60,120,0.4);
  border-color: #1d4ed8;
  color: #60a5fa;
}
.btn-call:hover:not(:disabled) { background: rgba(30,60,120,0.6); }

.btn-raise {
  background: rgba(120,20,20,0.4);
  border-color: var(--red-primary);
  color: var(--red-glow);
}
.btn-raise:hover:not(:disabled) { background: rgba(120,20,20,0.6); box-shadow: 0 0 12px rgba(220,38,38,0.3); }

.btn-allin {
  background: linear-gradient(135deg, var(--red-deep), #7f1d1d);
  border-color: var(--red-primary);
  color: var(--gold);
}
.btn-allin:hover:not(:disabled) { box-shadow: 0 0 20px rgba(220,38,38,0.5); }

.raise-slider {
  display: flex;
  align-items: center;
  gap: 8px;
}
.raise-slider input[type="range"] {
  width: 120px;
  accent-color: var(--red-primary);
}
.raise-amount {
  font-family: 'Share Tech Mono', monospace;
  font-size: 14px;
  color: var(--gold);
  min-width: 50px;
  text-align: center;
}

.btn-new-hand {
  padding: 14px 32px;
  background: linear-gradient(135deg, var(--red-deep), var(--red-primary));
  border: 1px solid var(--red-primary);
  border-radius: 2px;
  color: var(--text-primary);
  font-family: 'Orbitron', sans-serif;
  font-size: 13px;
  letter-spacing: 3px;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.3s;
}
.btn-new-hand:hover { box-shadow: 0 0 20px rgba(220,38,38,0.5); }

/* Game log */
.game-log {
  width: 100%;
  max-width: 900px;
  margin-top: 12px;
  padding: 12px;
  background: rgba(0,0,0,0.5);
  border: 1px solid var(--red-dim);
  border-radius: 2px;
  max-height: 100px;
  overflow-y: auto;
}
.log-entry {
  font-family: 'Share Tech Mono', monospace;
  font-size: 11px;
  color: var(--text-dim);
  padding: 2px 0;
}
.log-entry.important { color: var(--gold); }
.log-entry.action { color: var(--red-primary); }

/* ─── LEADERBOARD ─── */
.leaderboard-page {
  position: relative;
  z-index: 1;
  padding: 32px 24px;
  max-width: 800px;
  margin: 0 auto;
}

.lb-title {
  font-family: 'Orbitron', sans-serif;
  font-size: clamp(20px, 4vw, 32px);
  font-weight: 800;
  color: var(--text-primary);
  text-align: center;
  margin-bottom: 8px;
  text-shadow: 0 0 20px rgba(220,38,38,0.3);
}
.lb-subtitle {
  font-size: 12px;
  color: var(--text-dim);
  text-align: center;
  letter-spacing: 4px;
  text-transform: uppercase;
  margin-bottom: 32px;
}

.lb-table {
  width: 100%;
  border-collapse: collapse;
}
.lb-table th {
  font-family: 'Orbitron', sans-serif;
  font-size: 10px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--red-primary);
  padding: 12px 8px;
  text-align: left;
  border-bottom: 1px solid var(--red-dim);
}
.lb-table td {
  font-family: 'Share Tech Mono', monospace;
  font-size: 13px;
  padding: 10px 8px;
  border-bottom: 1px solid rgba(220,38,38,0.08);
  color: var(--text-secondary);
}
.lb-table tr:hover td { background: rgba(220,38,38,0.05); }
.lb-rank { color: var(--gold); font-weight: 700; width: 40px; }
.lb-rank-1 { color: #ffd700; }
.lb-rank-2 { color: #c0c0c0; }
.lb-rank-3 { color: #cd7f32; }
.lb-email { color: var(--text-primary); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lb-chips { color: var(--gold); }
.lb-wins { color: #52b788; }
.lb-you { background: rgba(220,38,38,0.08); }
.lb-you td { color: var(--text-primary); }

.lb-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 32px;
}
.stat-card {
  background: rgba(17,17,17,0.8);
  border: 1px solid var(--red-dim);
  border-radius: 2px;
  padding: 16px;
  text-align: center;
}
.stat-value {
  font-family: 'Orbitron', sans-serif;
  font-size: 24px;
  font-weight: 700;
  color: var(--gold);
}
.stat-label {
  font-size: 10px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-top: 4px;
}

/* Winner overlay */
.winner-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: fadeIn 0.3s ease;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.winner-box {
  background: linear-gradient(135deg, #1a0505, #0a0a0a);
  border: 2px solid var(--red-primary);
  border-radius: 4px;
  padding: 40px;
  text-align: center;
  max-width: 400px;
  box-shadow: 0 0 60px rgba(220,38,38,0.3);
  animation: popIn 0.4s ease;
}
@keyframes popIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }

.winner-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 14px;
  letter-spacing: 4px;
  color: var(--red-primary);
  text-transform: uppercase;
  margin-bottom: 12px;
}
.winner-name {
  font-family: 'Orbitron', sans-serif;
  font-size: 24px;
  font-weight: 800;
  color: var(--gold);
  text-shadow: 0 0 20px rgba(245,158,11,0.4);
  margin-bottom: 8px;
}
.winner-hand {
  font-family: 'Rajdhani', sans-serif;
  font-size: 16px;
  color: var(--text-secondary);
  margin-bottom: 16px;
}
.winner-chips {
  font-family: 'Share Tech Mono', monospace;
  font-size: 20px;
  color: var(--gold);
  margin-bottom: 24px;
}

/* Scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: var(--bg-dark); }
::-webkit-scrollbar-thumb { background: var(--red-dim); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--red-primary); }

/* Animations */
@keyframes dealCard {
  from { transform: translateY(-30px) rotateY(90deg); opacity: 0; }
  to { transform: translateY(0) rotateY(0); opacity: 1; }
}
.card-deal { animation: dealCard 0.3s ease forwards; }
`;

// ─── CARD COMPONENT ───
function Card({ card, small, faceDown, delay }) {
  if (!card && !faceDown) return null;
  const style = delay ? { animationDelay: `${delay}ms` } : {};
  if (faceDown) {
    return <div className={`card card-back card-deal ${small ? 'card-small' : ''}`} style={style} />;
  }
  const red = isRed(card.suit);
  return (
    <div className={`card card-face card-deal ${red ? 'red' : 'black'} ${small ? 'card-small' : ''}`} style={style}>
      <span className="card-rank">{card.rank}</span>
      <span className="card-suit">{card.suit}</span>
    </div>
  );
}

// ─── MAIN APP ───
export default function PokerApp() {
  const [screen, setScreen] = useState("login");
  const [tab, setTab] = useState("game");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [playerChips, setPlayerChips] = useState(STARTING_CHIPS);
  const [gameState, setGameState] = useState(null);
  const [logs, setLogs] = useState([]);
  const [raiseAmount, setRaiseAmount] = useState(BIG_BLIND * 2);
  const [showWinner, setShowWinner] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [stats, setStats] = useState({ handsPlayed: 0, handsWon: 0, biggestPot: 0, bestHand: "None" });
  const logRef = useRef(null);
  const aiTimerRef = useRef(null);

  // Load leaderboard
  useEffect(() => {
    loadLeaderboard();
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  async function loadLeaderboard() {
    try {
      const result = await window.storage.get("poker-leaderboard");
      if (result) setLeaderboard(JSON.parse(result.value));
    } catch (e) { /* no data yet */ }
  }

  async function loadPlayerData(em) {
    try {
      const result = await window.storage.get(`poker-player-${em}`);
      if (result) {
        const data = JSON.parse(result.value);
        setPlayerChips(data.chips || STARTING_CHIPS);
        setStats(data.stats || { handsPlayed: 0, handsWon: 0, biggestPot: 0, bestHand: "None" });
        return data.chips || STARTING_CHIPS;
      }
    } catch (e) { /* new player */ }
    return STARTING_CHIPS;
  }

  async function savePlayerData(chips, newStats) {
    try {
      await window.storage.set(`poker-player-${email}`, JSON.stringify({ chips, stats: newStats || stats, email }));
    } catch (e) { /* ignore */ }
  }

  async function updateLeaderboard(em, chips, won) {
    try {
      const result = await window.storage.get("poker-leaderboard");
      let lb = result ? JSON.parse(result.value) : [];
      const idx = lb.findIndex(p => p.email === em);
      if (idx >= 0) {
        lb[idx].chips = chips;
        lb[idx].handsPlayed = (lb[idx].handsPlayed || 0) + 1;
        if (won) lb[idx].handsWon = (lb[idx].handsWon || 0) + 1;
        lb[idx].lastSeen = Date.now();
      } else {
        lb.push({ email: em, chips, handsPlayed: 1, handsWon: won ? 1 : 0, lastSeen: Date.now() });
      }
      lb.sort((a,b) => b.chips - a.chips);
      await window.storage.set("poker-leaderboard", JSON.stringify(lb));
      setLeaderboard(lb);
    } catch (e) { /* ignore */ }
  }

  function addLog(msg, type = "") {
    setLogs(prev => [...prev.slice(-50), { msg, type, id: Date.now() + Math.random() }]);
  }

  // ─── LOGIN ───
  function handleLogin() {
    if (!email.includes("@")) return;
    const name = email.split("@")[0];
    setDisplayName(name);
    loadPlayerData(email).then(chips => {
      setPlayerChips(chips);
      setScreen("game");
    });
  }

  // ─── DEAL NEW HAND ───
  function dealNewHand() {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    
    const deck = createDeck();
    const numAI = 3;
    const aiPlayers = AI_NAMES.slice(0, numAI).map((name, i) => ({
      name,
      chips: 800 + Math.floor(Math.random() * 400),
      hand: [deck.pop(), deck.pop()],
      folded: false,
      bet: 0,
      allIn: false,
    }));

    const playerHand = [deck.pop(), deck.pop()];
    const communityCards = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];

    // Post blinds
    const totalPlayers = aiPlayers.length + 1;
    const sbIdx = 0; // AI 0 is small blind
    const bbIdx = 1; // AI 1 is big blind
    
    aiPlayers[sbIdx].chips -= SMALL_BLIND;
    aiPlayers[sbIdx].bet = SMALL_BLIND;
    aiPlayers[bbIdx].chips -= BIG_BLIND;
    aiPlayers[bbIdx].bet = BIG_BLIND;

    const newChips = playerChips;

    const state = {
      deck,
      aiPlayers,
      playerHand,
      communityCards,
      revealedCommunity: 0,
      pot: SMALL_BLIND + BIG_BLIND,
      playerBet: 0,
      currentBet: BIG_BLIND,
      phase: "preflop", // preflop, flop, turn, river, showdown
      playerFolded: false,
      playerAllIn: false,
      isPlayerTurn: true,
      handOver: false,
    };

    setGameState(state);
    setRaiseAmount(BIG_BLIND * 2);
    setLogs([]);
    addLog(`New hand dealt. Blinds: ${SMALL_BLIND}/${BIG_BLIND}`, "important");
    addLog(`${aiPlayers[sbIdx].name} posts small blind (${SMALL_BLIND})`);
    addLog(`${aiPlayers[bbIdx].name} posts big blind (${BIG_BLIND})`);
    setShowWinner(null);
  }

  // ─── PLAYER ACTIONS ───
  function playerFold() {
    if (!gameState || !gameState.isPlayerTurn || gameState.handOver) return;
    addLog("You fold.", "action");
    const newState = { ...gameState, playerFolded: true, handOver: true, isPlayerTurn: false };
    setGameState(newState);
    resolveHand(newState);
  }

  function playerCheck() {
    if (!gameState || !gameState.isPlayerTurn || gameState.handOver) return;
    if (gameState.currentBet > gameState.playerBet) return;
    addLog("You check.", "action");
    const newState = { ...gameState, isPlayerTurn: false };
    setGameState(newState);
    runAIThenAdvance(newState);
  }

  function playerCall() {
    if (!gameState || !gameState.isPlayerTurn || gameState.handOver) return;
    const toCall = Math.min(gameState.currentBet - gameState.playerBet, playerChips);
    const newChips = playerChips - toCall;
    setPlayerChips(newChips);
    addLog(`You call ${toCall}.`, "action");
    const newState = {
      ...gameState,
      playerBet: gameState.playerBet + toCall,
      pot: gameState.pot + toCall,
      isPlayerTurn: false,
      playerAllIn: newChips === 0,
    };
    setGameState(newState);
    runAIThenAdvance(newState);
  }

  function playerRaise() {
    if (!gameState || !gameState.isPlayerTurn || gameState.handOver) return;
    const totalBet = raiseAmount;
    const toAdd = totalBet - gameState.playerBet;
    if (toAdd > playerChips) return;
    const newChips = playerChips - toAdd;
    setPlayerChips(newChips);
    addLog(`You raise to ${totalBet}.`, "action");
    const newState = {
      ...gameState,
      playerBet: totalBet,
      currentBet: totalBet,
      pot: gameState.pot + toAdd,
      isPlayerTurn: false,
      playerAllIn: newChips === 0,
    };
    setGameState(newState);
    runAIThenAdvance(newState);
  }

  function playerAllIn() {
    if (!gameState || !gameState.isPlayerTurn || gameState.handOver) return;
    const toAdd = playerChips;
    const totalBet = gameState.playerBet + toAdd;
    setPlayerChips(0);
    addLog(`You go ALL IN! (${totalBet})`, "action");
    const newState = {
      ...gameState,
      playerBet: totalBet,
      currentBet: Math.max(gameState.currentBet, totalBet),
      pot: gameState.pot + toAdd,
      isPlayerTurn: false,
      playerAllIn: true,
    };
    setGameState(newState);
    runAIThenAdvance(newState);
  }

  // ─── AI LOGIC ───
  function runAIThenAdvance(state) {
    let s = { ...state, aiPlayers: state.aiPlayers.map(a => ({...a})) };
    
    for (let i = 0; i < s.aiPlayers.length; i++) {
      const ai = s.aiPlayers[i];
      if (ai.folded || ai.allIn || ai.chips <= 0) continue;

      const handStrength = evaluateHand([...ai.hand, ...s.communityCards.slice(0, s.revealedCommunity)]).rank;
      const rand = Math.random();
      const toCall = s.currentBet - ai.bet;

      if (toCall === 0) {
        // Can check or bet
        if (handStrength >= 3 && rand > 0.3) {
          const raiseAmt = Math.min(BIG_BLIND * (2 + handStrength), ai.chips);
          ai.chips -= raiseAmt;
          const newBet = ai.bet + raiseAmt;
          s.pot += raiseAmt;
          s.currentBet = Math.max(s.currentBet, newBet);
          ai.bet = newBet;
          addLog(`${ai.name} raises to ${newBet}.`);
        } else {
          addLog(`${ai.name} checks.`);
        }
      } else if (toCall > 0) {
        const foldThreshold = handStrength <= 0 ? 0.5 : handStrength <= 1 ? 0.25 : 0.05;
        if (rand < foldThreshold && toCall > BIG_BLIND * 2) {
          ai.folded = true;
          addLog(`${ai.name} folds.`);
        } else if (handStrength >= 4 && rand > 0.4 && ai.chips > toCall * 2) {
          const callAmt = Math.min(toCall, ai.chips);
          const raiseExtra = Math.min(BIG_BLIND * handStrength, ai.chips - callAmt);
          const totalAdd = callAmt + raiseExtra;
          ai.chips -= totalAdd;
          ai.bet += totalAdd;
          s.pot += totalAdd;
          s.currentBet = Math.max(s.currentBet, ai.bet);
          addLog(`${ai.name} raises to ${ai.bet}.`);
        } else {
          const callAmt = Math.min(toCall, ai.chips);
          ai.chips -= callAmt;
          ai.bet += callAmt;
          s.pot += callAmt;
          if (ai.chips === 0) ai.allIn = true;
          addLog(`${ai.name} calls ${callAmt}.`);
        }
      }
    }

    // Advance phase
    advancePhase(s);
  }

  function advancePhase(s) {
    const activePlayers = s.aiPlayers.filter(a => !a.folded).length + (s.playerFolded ? 0 : 1);
    
    if (activePlayers <= 1) {
      s.handOver = true;
      setGameState(s);
      resolveHand(s);
      return;
    }

    // Reset bets and advance
    s.aiPlayers.forEach(a => { a.bet = 0; });
    s.playerBet = 0;
    s.currentBet = 0;

    let newPhase = s.phase;
    let newRevealed = s.revealedCommunity;

    if (s.phase === "preflop") {
      newPhase = "flop";
      newRevealed = 3;
    } else if (s.phase === "flop") {
      newPhase = "turn";
      newRevealed = 4;
    } else if (s.phase === "turn") {
      newPhase = "river";
      newRevealed = 5;
    } else if (s.phase === "river") {
      newPhase = "showdown";
      s.handOver = true;
      s.revealedCommunity = 5;
      setGameState({...s, phase: newPhase, revealedCommunity: 5});
      resolveHand({...s, phase: newPhase, revealedCommunity: 5});
      return;
    }

    addLog(`── ${newPhase.toUpperCase()} ──`, "important");

    const updated = {
      ...s,
      phase: newPhase,
      revealedCommunity: newRevealed,
      isPlayerTurn: !s.playerFolded && !s.playerAllIn,
      playerBet: 0,
    };
    
    setGameState(updated);

    if (s.playerFolded || s.playerAllIn) {
      aiTimerRef.current = setTimeout(() => runAIThenAdvance(updated), 800);
    }
  }

  function resolveHand(state) {
    const community = state.communityCards.slice(0, Math.max(state.revealedCommunity, 5));
    let winners = [];
    let bestRank = -1;
    let bestTiebreaker = [];
    
    // Evaluate all non-folded players
    const candidates = [];
    
    if (!state.playerFolded) {
      const pEval = evaluateHand([...state.playerHand, ...community]);
      candidates.push({ name: displayName || "You", eval: pEval, isPlayer: true });
    }
    
    state.aiPlayers.forEach(ai => {
      if (!ai.folded) {
        const aEval = evaluateHand([...ai.hand, ...community]);
        candidates.push({ name: ai.name, eval: aEval, isPlayer: false });
      }
    });

    if (candidates.length === 1) {
      winners = [candidates[0]];
    } else {
      for (const c of candidates) {
        if (c.eval.rank > bestRank || (c.eval.rank === bestRank && compareTiebreaker(c.eval.tiebreaker, bestTiebreaker) > 0)) {
          bestRank = c.eval.rank;
          bestTiebreaker = c.eval.tiebreaker;
          winners = [c];
        } else if (c.eval.rank === bestRank && compareTiebreaker(c.eval.tiebreaker, bestTiebreaker) === 0) {
          winners.push(c);
        }
      }
    }

    const winAmount = Math.floor(state.pot / winners.length);
    const playerWon = winners.some(w => w.isPlayer);
    
    let newChips = playerChips;
    if (playerWon) {
      newChips = playerChips + winAmount;
      setPlayerChips(newChips);
    }

    const newStats = {
      handsPlayed: stats.handsPlayed + 1,
      handsWon: playerWon ? stats.handsWon + 1 : stats.handsWon,
      biggestPot: Math.max(stats.biggestPot, state.pot),
      bestHand: candidates.find(c => c.isPlayer)?.eval?.rank > HAND_NAMES.indexOf(stats.bestHand) 
        ? candidates.find(c => c.isPlayer)?.eval?.name || stats.bestHand 
        : stats.bestHand,
    };
    setStats(newStats);
    savePlayerData(newChips, newStats);
    updateLeaderboard(email, newChips, playerWon);

    const winnerName = winners.map(w => w.name).join(" & ");
    const handName = winners[0]?.eval?.name || "Unknown";
    
    addLog(`${winnerName} wins ${winAmount} with ${handName}!`, "important");

    // Show all cards at showdown
    setGameState(prev => ({...prev, handOver: true, revealedCommunity: 5}));
    
    setShowWinner({
      name: winnerName,
      hand: handName,
      amount: winAmount,
      isPlayer: playerWon,
    });
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
  }, []);

  // ─── RENDER ───
  if (screen === "login") {
    return (
      <div className="app-container">
        <style>{CSS}</style>
        <div className="circuit-bg" />
        <div className="login-screen">
          <div className="login-logo">BR<span>@</span>INSTORM</div>
          <div className="login-subtitle">Poker Arena</div>
          <div className="login-box">
            <h2>Enter the Dojo</h2>
            <input
              className="login-input"
              type="email"
              placeholder="warrior@brainstorm.ge"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
            />
            <button
              className="login-btn"
              onClick={handleLogin}
              disabled={!email.includes("@")}
            >
              Join Table
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canCheck = gameState?.isPlayerTurn && gameState.currentBet === gameState.playerBet;
  const canCall = gameState?.isPlayerTurn && gameState.currentBet > gameState.playerBet;
  const callAmount = gameState ? Math.min(gameState.currentBet - gameState.playerBet, playerChips) : 0;
  const minRaise = gameState ? gameState.currentBet + BIG_BLIND : BIG_BLIND * 2;

  return (
    <div className="app-container">
      <style>{CSS}</style>
      <div className="circuit-bg" />

      {/* NAV */}
      <div className="top-nav">
        <div className="nav-brand">BR<span>@</span>INSTORM <span style={{fontSize:'10px',opacity:0.5}}>POKER</span></div>
        <div className="nav-tabs">
          <button className={`nav-tab ${tab === 'game' ? 'active' : ''}`} onClick={() => setTab('game')}>Table</button>
          <button className={`nav-tab ${tab === 'leaderboard' ? 'active' : ''}`} onClick={() => { setTab('leaderboard'); loadLeaderboard(); }}>Ranks</button>
        </div>
        <div className="nav-user">
          <span className="nav-chips">⬣ {playerChips.toLocaleString()}</span>
          <span className="nav-email">{email}</span>
          <button className="nav-logout" onClick={() => { setScreen('login'); setGameState(null); }}>Exit</button>
        </div>
      </div>

      {/* GAME TAB */}
      {tab === "game" && (
        <div className="game-area">
          {!gameState ? (
            <div style={{ textAlign: 'center', marginTop: '80px' }}>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '14px', letterSpacing: '4px', color: 'var(--red-primary)', marginBottom: '24px', textTransform: 'uppercase' }}>
                Ready to Battle?
              </div>
              <button className="btn-new-hand" onClick={dealNewHand}>Deal Hand</button>
            </div>
          ) : (
            <>
              {/* POKER TABLE */}
              <div className="poker-table">
                {/* AI Players */}
                <div className="ai-players">
                  {gameState.aiPlayers.map((ai, i) => (
                    <div className="ai-seat" key={ai.name}>
                      <div className={`ai-name ${ai.folded ? 'folded' : ''} ${gameState.isPlayerTurn ? '' : 'active-player'}`}>
                        {ai.name}
                      </div>
                      <div className="ai-chips-display">⬣ {ai.chips}</div>
                      <div className="ai-cards">
                        {gameState.handOver && !ai.folded ? (
                          <>
                            <Card card={ai.hand[0]} small delay={i * 100} />
                            <Card card={ai.hand[1]} small delay={i * 100 + 50} />
                          </>
                        ) : ai.folded ? null : (
                          <>
                            <Card faceDown small />
                            <Card faceDown small />
                          </>
                        )}
                      </div>
                      {ai.bet > 0 && <div className="ai-bet-amount">Bet: {ai.bet}</div>}
                      {gameState.handOver && !ai.folded && (
                        <div className="ai-hand-result">
                          {evaluateHand([...ai.hand, ...gameState.communityCards.slice(0, gameState.revealedCommunity)]).name}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Pot */}
                <div className="pot-display">
                  <div className="pot-label">Pot</div>
                  <div className="pot-amount">⬣ {gameState.pot.toLocaleString()}</div>
                </div>

                {/* Community Cards */}
                <div className="community-area">
                  <div className="community-label">Community Cards</div>
                  <div className="community-cards">
                    {[0,1,2,3,4].map(i => (
                      i < gameState.revealedCommunity ? (
                        <Card key={i} card={gameState.communityCards[i]} delay={i * 120} />
                      ) : (
                        <Card key={i} faceDown />
                      )
                    ))}
                  </div>
                </div>

                {/* Player */}
                <div className="player-area">
                  <div className="player-info">
                    <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '12px', color: gameState.isPlayerTurn ? 'var(--red-primary)' : 'var(--text-secondary)' }}>
                      {displayName} {gameState.playerFolded ? '(Folded)' : gameState.isPlayerTurn ? '⟨ Your Turn ⟩' : ''}
                    </span>
                    <span className="player-chip-count">⬣ {playerChips.toLocaleString()}</span>
                    {gameState.playerBet > 0 && (
                      <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '12px', color: 'var(--red-primary)' }}>
                        Bet: {gameState.playerBet}
                      </span>
                    )}
                  </div>
                  {!gameState.playerFolded && (
                    <>
                      <div className="player-hand">
                        <Card card={gameState.playerHand[0]} delay={0} />
                        <Card card={gameState.playerHand[1]} delay={80} />
                      </div>
                      {gameState.revealedCommunity > 0 && (
                        <div className="player-hand-name">
                          {evaluateHand([...gameState.playerHand, ...gameState.communityCards.slice(0, gameState.revealedCommunity)]).name}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Controls */}
              {gameState.isPlayerTurn && !gameState.handOver && (
                <div className="controls-bar">
                  <button className="ctrl-btn btn-fold" onClick={playerFold}>Fold</button>
                  {canCheck && <button className="ctrl-btn btn-check" onClick={playerCheck}>Check</button>}
                  {canCall && <button className="ctrl-btn btn-call" onClick={playerCall}>Call {callAmount}</button>}
                  <div className="raise-slider">
                    <input
                      type="range"
                      min={minRaise}
                      max={playerChips + (gameState?.playerBet || 0)}
                      step={BIG_BLIND}
                      value={raiseAmount}
                      onChange={e => setRaiseAmount(+e.target.value)}
                    />
                    <span className="raise-amount">{raiseAmount}</span>
                  </div>
                  <button className="ctrl-btn btn-raise" onClick={playerRaise} disabled={raiseAmount > playerChips + gameState.playerBet}>
                    Raise
                  </button>
                  <button className="ctrl-btn btn-allin" onClick={playerAllIn}>All In</button>
                </div>
              )}

              {gameState.handOver && (
                <div style={{ marginTop: '16px' }}>
                  <button className="btn-new-hand" onClick={dealNewHand}>Next Hand</button>
                </div>
              )}

              {/* Game Log */}
              <div className="game-log" ref={logRef}>
                {logs.map(l => (
                  <div key={l.id} className={`log-entry ${l.type}`}>{l.msg}</div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* LEADERBOARD TAB */}
      {tab === "leaderboard" && (
        <div className="leaderboard-page">
          <div className="lb-title">Hall of Warriors</div>
          <div className="lb-subtitle">Ranked by Total Chips</div>

          <div className="lb-stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.handsPlayed}</div>
              <div className="stat-label">Hands Played</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.handsWon}</div>
              <div className="stat-label">Hands Won</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.handsPlayed > 0 ? Math.round((stats.handsWon / stats.handsPlayed) * 100) : 0}%</div>
              <div className="stat-label">Win Rate</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">⬣ {stats.biggestPot.toLocaleString()}</div>
              <div className="stat-label">Biggest Pot</div>
            </div>
          </div>

          <table className="lb-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Warrior</th>
                <th>Chips</th>
                <th>Played</th>
                <th>Won</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-dim)' }}>No warriors yet. Be the first.</td></tr>
              ) : leaderboard.map((p, i) => (
                <tr key={p.email} className={p.email === email ? 'lb-you' : ''}>
                  <td className={`lb-rank ${i === 0 ? 'lb-rank-1' : i === 1 ? 'lb-rank-2' : i === 2 ? 'lb-rank-3' : ''}`}>{i + 1}</td>
                  <td className="lb-email">{p.email.split("@")[0]}</td>
                  <td className="lb-chips">⬣ {(p.chips || 0).toLocaleString()}</td>
                  <td>{p.handsPlayed || 0}</td>
                  <td className="lb-wins">{p.handsWon || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Winner Overlay */}
      {showWinner && (
        <div className="winner-overlay" onClick={() => setShowWinner(null)}>
          <div className="winner-box" onClick={e => e.stopPropagation()}>
            <div className="winner-title">{showWinner.isPlayer ? "Victory" : "Defeated"}</div>
            <div className="winner-name">{showWinner.name}</div>
            <div className="winner-hand">{showWinner.hand}</div>
            <div className="winner-chips">+⬣ {showWinner.amount.toLocaleString()}</div>
            <button className="btn-new-hand" onClick={() => { setShowWinner(null); dealNewHand(); }}>
              Next Hand
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
