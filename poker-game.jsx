import { useState, useEffect, useCallback, useRef } from "react";

// ─── CONSTANTS ───
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const HAND_NAMES = ["High Card","One Pair","Two Pair","Three of a Kind","Straight","Flush","Full House","Four of a Kind","Straight Flush","Royal Flush"];
const AI_NAMES = ["Ronin_X","ShadowBlade","VoidWalker","CircuitSensei","NeonShogun","StormCaster"];
const STARTING_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;

// ─── MULTIPLAYER DETECTION ───
let MP_TABLE_ID = "", MP_SEAT_INDEX = -1, MP_IS_HOST = false, MP_PLAYER_NAME = "";
let MP_TOTAL_SEATS = 6, MP_STAKE = 0, MP_SMALL_BLIND = SMALL_BLIND, MP_BIG_BLIND = BIG_BLIND;
let MP_PLAYERS = [];

let isMultiplayer = false;
if (typeof URLSearchParams !== "undefined") {
  try { const p = new URLSearchParams(window.location.search); isMultiplayer = p.has("tableId"); } catch {}
}
if (isMultiplayer) {
  const p = new URLSearchParams(window.location.search);
  MP_TABLE_ID = p.get("tableId") || "";
  MP_SEAT_INDEX = parseInt(p.get("seatIndex") || "0", 10);
  MP_IS_HOST = p.get("isHost") === "1";
  MP_PLAYER_NAME = p.get("playerName") || "";
  MP_TOTAL_SEATS = parseInt(p.get("totalSeats") || "6", 10);
  MP_STAKE = parseInt(p.get("stake") || "0", 10);
  MP_SMALL_BLIND = parseInt(p.get("smallBlind") || String(SMALL_BLIND), 10);
  MP_BIG_BLIND = parseInt(p.get("bigBlind") || String(BIG_BLIND), 10);
}

function postToParent(msg) {
  if (typeof window !== "undefined" && window.parent && window.parent !== window) {
    window.parent.postMessage(msg, "*");
  }
}

// Simple obfuscation for PII in localStorage — not cryptographic, just avoids plaintext emails
function hashEmail(em) {
  let h = 0;
  for (let i = 0; i < em.length; i++) {
    h = ((h << 5) - h + em.charCodeAt(i)) | 0;
  }
  return "p_" + Math.abs(h).toString(36);
}


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

/* ═══════════════════════════════════════════════════════════════════════════
   BR@INSTORM SKIN SYSTEM — Poker variable contract
   ═══════════════════════════════════════════════════════════════════════════

   CSS variables follow the standard brainstorm skin system naming convention.
   When loaded inside the platform, the active skin CSS overrides these
   :root defaults with its own palette.

   When standalone (no skin loaded), the :root values below provide the
   default red/black "RONIN" poker theme.

   Poker-specific variables (--poker-*) are additional — they are NOT
   overridden by general skins. A dedicated poker skin can target them
   separately (e.g. html[data-skin="terminal"] { --poker-felt: ... }).
   ═══════════════════════════════════════════════════════════════════════════ */

:root {
  /* ── Theme variables (standard brainstorm contract) ── */
  --theme-bg-primary: #0a0a0a;
  --theme-bg-secondary: #0f0f0f;
  --theme-bg-tertiary: #161616;
  --theme-card-bg: #111111;
  --theme-text-primary: #f5f5f5;
  --theme-text-secondary: #a3a3a3;
  --theme-text-muted: #525252;
  --theme-accent-primary: #dc2626;
  --theme-accent-secondary: #ef4444;
  --theme-border-primary: rgba(220,38,38,0.3);
  --theme-border-secondary: rgba(220,38,38,0.15);

  /* ── Poker-specific variables ── */
  --poker-felt: #0d3320;
  --poker-felt-light: #15503a;
  --poker-accent-deep: #991b1b;
  --poker-accent-dim: #7f1d1d;
  --poker-circuit: rgba(220,38,38,0.15);
  --poker-gold: #f59e0b;
  --poker-card-red: #dc2626;
  --poker-card-black: #1a1a1a;

  /* ── shadcn HSL compat (for Tailwind hosts that embed poker) ── */
  --background: 0 0% 4%;
  --foreground: 0 0% 96%;
  --card: 0 0% 7%;
  --card-foreground: 0 0% 96%;
  --primary: 0 84% 60%;
  --primary-foreground: 0 0% 100%;
  --secondary: 0 0% 8%;
  --secondary-foreground: 0 0% 96%;
  --muted: 0 0% 8%;
  --muted-foreground: 0 0% 32%;
  --accent: 0 84% 60%;
  --accent-foreground: 0 0% 100%;
  --destructive: 0 63% 31%;
  --destructive-foreground: 0 0% 98%;
  --border: 0 30% 20%;
  --input: 0 30% 20%;
  --ring: 0 84% 60%;
  --radius: 0.3rem;
}

* { margin:0; padding:0; box-sizing:border-box; }

body {
  background: var(--theme-bg-primary);
  color: var(--theme-text-primary);
  font-family: 'Rajdhani', sans-serif;
  overflow-x: hidden;
}

.app-container {
  min-height: 100vh;
  background: var(--theme-bg-primary);
  position: relative;
}

/* Circuit board background pattern */
.circuit-bg {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background:
    linear-gradient(90deg, transparent 49.5%, var(--poker-circuit) 49.5%, var(--poker-circuit) 50.5%, transparent 50.5%) 0 0 / 60px 60px,
    linear-gradient(0deg, transparent 49.5%, var(--poker-circuit) 49.5%, var(--poker-circuit) 50.5%, transparent 50.5%) 0 0 / 60px 60px,
    radial-gradient(circle 2px, var(--theme-accent-primary) 100%, transparent 100%) 0 0 / 60px 60px;
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
  color: var(--theme-text-primary);
  text-shadow: 0 0 30px var(--theme-accent-primary), 0 0 60px var(--theme-accent-secondary);
  letter-spacing: 4px;
  margin-bottom: 8px;
}
.login-logo span { color: var(--theme-accent-primary); }

.login-subtitle {
  font-family: 'Rajdhani', sans-serif;
  font-size: clamp(12px, 2.5vw, 16px);
  color: var(--theme-accent-primary);
  letter-spacing: 6px;
  text-transform: uppercase;
  margin-bottom: 48px;
  opacity: 0.8;
}

.login-box {
  background: linear-gradient(135deg, var(--theme-card-bg), var(--theme-bg-secondary));
  border: 1px solid var(--theme-border-primary);
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
  background: linear-gradient(90deg, transparent, var(--theme-accent-primary), transparent);
}

.login-box h2 {
  font-family: 'Orbitron', sans-serif;
  font-size: 14px;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: var(--theme-accent-primary);
  margin-bottom: 24px;
}

.login-input {
  width: 100%;
  padding: 14px 16px;
  background: rgba(0,0,0,0.6);
  border: 1px solid var(--theme-border-primary);
  border-radius: 2px;
  color: var(--theme-text-primary);
  font-family: 'Share Tech Mono', monospace;
  font-size: 14px;
  margin-bottom: 16px;
  outline: none;
  transition: border-color 0.3s;
}
.login-input:focus { border-color: var(--theme-accent-primary); box-shadow: 0 0 10px var(--theme-accent-primary); }
.login-input::placeholder { color: var(--theme-text-muted); }

.login-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, var(--poker-accent-deep), var(--theme-accent-primary));
  border: 1px solid var(--theme-accent-primary);
  border-radius: 2px;
  color: var(--theme-text-primary);
  font-family: 'Orbitron', sans-serif;
  font-size: 13px;
  letter-spacing: 3px;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.3s;
  position: relative;
  overflow: hidden;
}
.login-btn:hover { box-shadow: 0 0 20px var(--theme-accent-secondary); transform: translateY(-1px); }
.login-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ─── NAV ─── */
.top-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: var(--theme-bg-primary);
  border-bottom: 1px solid var(--theme-border-primary);
  position: relative;
  z-index: 10;
  flex-wrap: wrap;
  gap: 8px;
}
.nav-brand {
  font-family: 'Orbitron', sans-serif;
  font-size: clamp(14px, 3vw, 20px);
  font-weight: 800;
  color: var(--theme-text-primary);
  letter-spacing: 2px;
}
.nav-brand span { color: var(--theme-accent-primary); }

.nav-tabs {
  display: flex;
  gap: 4px;
}
.nav-tab {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 2px;
  color: var(--theme-text-secondary);
  font-family: 'Rajdhani', sans-serif;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.3s;
}
.nav-tab:hover { color: var(--theme-accent-primary); }
.nav-tab.active {
  color: var(--theme-accent-primary);
  border-color: var(--theme-border-primary);
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
  color: var(--poker-gold);
}
.nav-email {
  font-family: 'Share Tech Mono', monospace;
  font-size: 11px;
  color: var(--theme-text-muted);
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nav-logout {
  padding: 6px 12px;
  background: transparent;
  border: 1px solid var(--theme-border-primary);
  border-radius: 2px;
  color: var(--theme-text-muted);
  font-size: 11px;
  font-family: 'Rajdhani', sans-serif;
  cursor: pointer;
  transition: all 0.3s;
}
.nav-logout:hover { color: var(--theme-accent-primary); border-color: var(--theme-accent-primary); }

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
  background: radial-gradient(ellipse at center, var(--poker-felt-light), var(--poker-felt), #091a12);
  border: 3px solid var(--theme-border-primary);
  border-radius: 180px;
  padding: clamp(20px, 4vw, 40px) clamp(16px, 3vw, 30px);
  position: relative;
  box-shadow: 0 0 40px var(--theme-accent-primary), inset 0 0 60px rgba(0,0,0,0.4);
  margin: 16px 0;
}
.poker-table::before {
  content: '';
  position: absolute;
  top: 6px; left: 6px; right: 6px; bottom: 6px;
  border: 1px solid var(--theme-border-secondary);
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
  color: var(--theme-text-muted);
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
  color: var(--poker-gold);
  text-shadow: 0 0 15px rgba(245,158,11,0.4);
}
.pot-label {
  font-size: 10px;
  letter-spacing: 3px;
  color: var(--theme-text-muted);
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
  color: var(--theme-text-secondary);
  margin-bottom: 4px;
  white-space: nowrap;
}
.ai-name.folded { color: var(--theme-text-muted); text-decoration: line-through; }
.ai-name.active-player { color: var(--theme-accent-primary); }
.ai-chips-display {
  font-family: 'Share Tech Mono', monospace;
  font-size: 10px;
  color: var(--poker-gold);
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
  color: var(--theme-accent-primary);
  margin-top: 2px;
}
.ai-hand-result {
  font-family: 'Rajdhani', sans-serif;
  font-size: 10px;
  color: var(--poker-gold);
  margin-top: 2px;
  font-weight: 600;
}

/* Player area */
.player-area {
  text-align: center;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--theme-border-secondary);
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
  color: var(--poker-gold);
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
  color: var(--poker-gold);
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
.card-face.red { color: var(--poker-card-red); }
.card-face.black { color: var(--poker-card-black); }

.card-back {
  background: linear-gradient(135deg, var(--poker-accent-deep), var(--theme-bg-secondary));
  border: 1px solid var(--theme-border-primary);
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
}
.card-back::after {
  content: '武';
  font-family: serif;
  font-size: clamp(16px, 3vw, 24px);
  color: var(--theme-accent-primary);
  opacity: 0.3;
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
  color: var(--theme-text-secondary);
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
  border-color: var(--theme-accent-primary);
  color: var(--theme-accent-secondary);
}
.btn-raise:hover:not(:disabled) { background: rgba(120,20,20,0.6); box-shadow: 0 0 12px var(--theme-accent-primary); }

.btn-allin {
  background: linear-gradient(135deg, var(--poker-accent-deep), var(--poker-accent-dim));
  border-color: var(--theme-accent-primary);
  color: var(--poker-gold);
}
.btn-allin:hover:not(:disabled) { box-shadow: 0 0 20px var(--theme-accent-secondary); }

.raise-slider {
  display: flex;
  align-items: center;
  gap: 8px;
}
.raise-slider input[type="range"] {
  width: 120px;
  accent-color: var(--theme-accent-primary);
}
.raise-amount {
  font-family: 'Share Tech Mono', monospace;
  font-size: 14px;
  color: var(--poker-gold);
  min-width: 50px;
  text-align: center;
}

.btn-new-hand {
  padding: 14px 32px;
  background: linear-gradient(135deg, var(--poker-accent-deep), var(--theme-accent-primary));
  border: 1px solid var(--theme-accent-primary);
  border-radius: 2px;
  color: var(--theme-text-primary);
  font-family: 'Orbitron', sans-serif;
  font-size: 13px;
  letter-spacing: 3px;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.3s;
}
.btn-new-hand:hover { box-shadow: 0 0 20px var(--theme-accent-secondary); }

/* Game log */
.game-log {
  width: 100%;
  max-width: 900px;
  margin-top: 12px;
  padding: 12px;
  background: rgba(0,0,0,0.5);
  border: 1px solid var(--theme-border-primary);
  border-radius: 2px;
  max-height: 100px;
  overflow-y: auto;
}
.log-entry {
  font-family: 'Share Tech Mono', monospace;
  font-size: 11px;
  color: var(--theme-text-muted);
  padding: 2px 0;
}
.log-entry.important { color: var(--poker-gold); }
.log-entry.action { color: var(--theme-accent-primary); }

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
  color: var(--theme-text-primary);
  text-align: center;
  margin-bottom: 8px;
  text-shadow: 0 0 20px var(--theme-accent-primary);
}
.lb-subtitle {
  font-size: 12px;
  color: var(--theme-text-muted);
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
  color: var(--theme-accent-primary);
  padding: 12px 8px;
  text-align: left;
  border-bottom: 1px solid var(--theme-border-primary);
}
.lb-table td {
  font-family: 'Share Tech Mono', monospace;
  font-size: 13px;
  padding: 10px 8px;
  border-bottom: 1px solid var(--theme-border-secondary);
  color: var(--theme-text-secondary);
}
.lb-table tr:hover td { background: var(--theme-border-secondary); }
.lb-rank { color: var(--poker-gold); font-weight: 700; width: 40px; }
.lb-rank-1 { color: #ffd700; }
.lb-rank-2 { color: #c0c0c0; }
.lb-rank-3 { color: #cd7f32; }
.lb-email { color: var(--theme-text-primary); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lb-chips { color: var(--poker-gold); }
.lb-wins { color: #52b788; }
.lb-you { background: var(--theme-border-secondary); }
.lb-you td { color: var(--theme-text-primary); }

.lb-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 32px;
}
.stat-card {
  background: var(--theme-card-bg);
  border: 1px solid var(--theme-border-primary);
  border-radius: 2px;
  padding: 16px;
  text-align: center;
}
.stat-value {
  font-family: 'Orbitron', sans-serif;
  font-size: 24px;
  font-weight: 700;
  color: var(--poker-gold);
}
.stat-label {
  font-size: 10px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--theme-text-muted);
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
  background: linear-gradient(135deg, var(--poker-accent-deep), var(--theme-bg-primary));
  border: 2px solid var(--theme-accent-primary);
  border-radius: 4px;
  padding: 40px;
  text-align: center;
  max-width: 400px;
  box-shadow: 0 0 60px var(--theme-accent-primary);
  animation: popIn 0.4s ease;
}
@keyframes popIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }

.winner-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 14px;
  letter-spacing: 4px;
  color: var(--theme-accent-primary);
  text-transform: uppercase;
  margin-bottom: 12px;
}
.winner-name {
  font-family: 'Orbitron', sans-serif;
  font-size: 24px;
  font-weight: 800;
  color: var(--poker-gold);
  text-shadow: 0 0 20px rgba(245,158,11,0.4);
  margin-bottom: 8px;
}
.winner-hand {
  font-family: 'Rajdhani', sans-serif;
  font-size: 16px;
  color: var(--theme-text-secondary);
  margin-bottom: 16px;
}
.winner-chips {
  font-family: 'Share Tech Mono', monospace;
  font-size: 20px;
  color: var(--poker-gold);
  margin-bottom: 24px;
}

/* Scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: var(--theme-bg-primary); }
::-webkit-scrollbar-thumb { background: var(--theme-border-primary); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--theme-accent-primary); }

/* Animations */
@keyframes dealCard {
  from { transform: translateY(-30px) rotateY(90deg); opacity: 0; }
  to { transform: translateY(0) rotateY(0); opacity: 1; }
}
.card-deal { animation: dealCard 0.3s ease forwards; }
`;
// ─── SKIN LOADING ───
const SKIN_MAP = {
  default: null,
  terminal: "skins/poker-terminal.css",
  neotokyo: "skins/poker-neotokyo.css",
  sakura: "skins/poker-sakura.css",
  zen: "skins/poker-zen.css",
  samurai: "skins/poker-samurai.css",
};

function getActiveSkin() {
  if (typeof window === "undefined") return "default";
  const params = new URLSearchParams(window.location.search);
  return params.get("skin") || "default";
}

function loadSkinCSS(skinId) {
  const path = SKIN_MAP[skinId];
  if (!path) return;
  const linkId = "poker-skin-link";
  let link = document.getElementById(linkId);
  if (!link) {
    link = document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  link.href = path;
}

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

  // Load skin from URL param
  useEffect(() => {
    const skin = getActiveSkin();
    loadSkinCSS(skin);
  }, []);

  // Multiplayer: postMessage listener
  useEffect(() => {
    if (!isMultiplayer) return;
    function onMsg(e) {
      const d = e.data;
      if (!d || typeof d !== "object") return;
      switch (d.type) {
        case "poker-init":
          MP_TABLE_ID = d.tableId || MP_TABLE_ID;
          MP_SEAT_INDEX = d.seatIndex != null ? d.seatIndex : MP_SEAT_INDEX;
          MP_IS_HOST = Boolean(d.isHost);
          MP_PLAYER_NAME = d.playerName || MP_PLAYER_NAME;
          MP_TOTAL_SEATS = d.totalSeats || MP_TOTAL_SEATS;
          MP_STAKE = d.stakeCredits || MP_STAKE;
          MP_SMALL_BLIND = d.smallBlind || MP_SMALL_BLIND;
          MP_BIG_BLIND = d.bigBlind || MP_BIG_BLIND;
          MP_PLAYERS = d.players || [];
          setDisplayName(MP_PLAYER_NAME);
          setScreen("game");
          break;
        case "poker-state-sync":
          if (d.gameState) setGameState(d.gameState);
          if (d.playerChips != null) setPlayerChips(d.playerChips);
          if (d.logs) setLogs(d.logs);
          break;
        case "poker-hand-result-broadcast":
          if (d.results) setShowWinner(d.results);
          break;
        case "poker-table-update":
          if (d.players) MP_PLAYERS = d.players;
          break;
      }
    }
    window.addEventListener("message", onMsg);
    postToParent({ type: "poker-ready", tableId: MP_TABLE_ID });
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Load leaderboard
  useEffect(() => {
    loadLeaderboard();
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  function loadLeaderboard() {
    try {
      const raw = localStorage.getItem("poker-leaderboard");
      if (raw) {
        const lb = JSON.parse(raw);
        // Backfill: migrate old plaintext-email entries to hashed
        let migrated = false;
        for (const entry of lb) {
          if (entry.email && !entry.email.startsWith("p_")) {
            entry.emailHash = hashEmail(entry.email);
            entry.displayName = entry.displayName || entry.email.split("@")[0];
            migrated = true;
          }
        }
        if (migrated) localStorage.setItem("poker-leaderboard", JSON.stringify(lb));
        setLeaderboard(lb);
      }
    } catch (e) { /* no data yet */ }
  }

  function loadPlayerData(em) {
    try {
      const key = hashEmail(em);
      const raw = localStorage.getItem(`poker-player-${key}`);
      if (raw) {
        const data = JSON.parse(raw);
        setPlayerChips(data.chips || STARTING_CHIPS);
        setStats(data.stats || { handsPlayed: 0, handsWon: 0, biggestPot: 0, bestHand: "None" });
        return data.chips || STARTING_CHIPS;
      }
    } catch (e) { /* new player */ }
    return STARTING_CHIPS;
  }

  function savePlayerData(chips, newStats) {
    try {
      const key = hashEmail(email);
      localStorage.setItem(`poker-player-${key}`, JSON.stringify({ chips, stats: newStats || stats, displayName }));
    } catch (e) { /* ignore */ }
  }

  function updateLeaderboard(em, chips, won) {
    try {
      const emailHash = hashEmail(em);
      const raw = localStorage.getItem("poker-leaderboard");
      let lb = raw ? JSON.parse(raw) : [];
      const idx = lb.findIndex(p => p.emailHash === emailHash);
      if (idx >= 0) {
        lb[idx].chips = chips;
        lb[idx].handsPlayed = (lb[idx].handsPlayed || 0) + 1;
        if (won) lb[idx].handsWon = (lb[idx].handsWon || 0) + 1;
        lb[idx].lastSeen = Date.now();
      } else {
        lb.push({ emailHash, displayName: displayName || em.split("@")[0], chips, handsPlayed: 1, handsWon: won ? 1 : 0, lastSeen: Date.now() });
      }
      lb.sort((a,b) => b.chips - a.chips);
      localStorage.setItem("poker-leaderboard", JSON.stringify(lb));
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
    const chips = loadPlayerData(email);
    setPlayerChips(chips);
    setScreen("game");
  }

  // ─── DEAL NEW HAND ───
  function dealNewHand() {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    if (isMultiplayer && !MP_IS_HOST) return;
    const sb = isMultiplayer ? MP_SMALL_BLIND : SMALL_BLIND;
    const bb = isMultiplayer ? MP_BIG_BLIND : BIG_BLIND;
    const deck = createDeck();
    let opponents;
    if (isMultiplayer) {
      opponents = [];
      for (let i = 0; i < MP_TOTAL_SEATS; i++) {
        if (i === MP_SEAT_INDEX) continue;
        opponents.push({
          name: MP_PLAYERS[i] || ("Player " + (i + 1)),
          chips: STARTING_CHIPS,
          hand: [deck.pop(), deck.pop()],
          folded: false, bet: 0, allIn: false,
          isHuman: true, seatIndex: i,
        });
      }
    } else {
      const numAI = 3;
      opponents = AI_NAMES.slice(0, numAI).map((name) => ({
        name,
        chips: 800 + Math.floor(Math.random() * 400),
        hand: [deck.pop(), deck.pop()],
        folded: false, bet: 0, allIn: false, isHuman: false,
      }));
    }

    const playerHand = [deck.pop(), deck.pop()];
    const communityCards = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];

    const sbIdx = 0, bbIdx = 1;
    if (opponents.length > sbIdx) { opponents[sbIdx].chips -= sb; opponents[sbIdx].bet = sb; }
    if (opponents.length > bbIdx) { opponents[bbIdx].chips -= bb; opponents[bbIdx].bet = bb; }

    const state = {
      deck,
      aiPlayers: opponents,
      playerHand,
      communityCards,
      revealedCommunity: 0,
      pot: sb + bb,
      playerBet: 0,
      currentBet: bb,
      phase: "preflop",
      playerFolded: false,
      playerAllIn: false,
      isPlayerTurn: true,
      handOver: false,
    };

    setGameState(state);
    setRaiseAmount(bb * 2);
    setLogs([]);
    addLog("New hand dealt. Blinds: " + sb + "/" + bb, "important");
    if (opponents.length > sbIdx) addLog(opponents[sbIdx].name + " posts small blind (" + sb + ")");
    if (opponents.length > bbIdx) addLog(opponents[bbIdx].name + " posts big blind (" + bb + ")");
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

    if (isMultiplayer) { advancePhase(s); return; }

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
    if (!isMultiplayer) {
      savePlayerData(newChips, newStats);
      updateLeaderboard(email, newChips, playerWon);
    }

    const winnerName = winners.map(w => w.name).join(" & ");
    const handName = winners[0]?.eval?.name || "Unknown";

    addLog(`${winnerName} wins ${winAmount} with ${handName}!`, "important");

    setGameState(prev => ({...prev, handOver: true, revealedCommunity: 5}));

    setShowWinner({
      name: winnerName,
      hand: handName,
      amount: winAmount,
      isPlayer: playerWon,
    });

    if (isMultiplayer && MP_IS_HOST) {
      const handResults = {
        winner_seat_indexes: winners.map(w => {
          if (w.isPlayer) return MP_SEAT_INDEX;
          const opp = state.aiPlayers.find(a => a.name === w.name);
          return opp ? opp.seatIndex : -1;
        }).filter(i => i >= 0),
        winning_hand_name: handName,
        pot_chips: state.pot,
        community_cards: state.communityCards,
        player_hands: {
          player: state.playerHand,
          opponents: state.aiPlayers
            .filter(a => !a.folded)
            .map(a => ({ name: a.name, hand: a.hand })),
        },
      };
      const handState = {
        phase: state.phase, pot: state.pot, communityCards: state.communityCards,
        aiPlayers: state.aiPlayers.map(a => ({
          name: a.name, chips: a.chips, folded: a.folded,
          bet: a.bet, allIn: a.allIn, seatIndex: a.seatIndex,
        })),
      };
      postToParent({ type: "poker-hand-result", tableId: MP_TABLE_ID, handState, handResults });
    }
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
  }, []);

  // ─── RENDER ───
  if (screen === "login" && !isMultiplayer) {
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
        <div className="nav-brand">BR<span>@</span>INSTORM <span style={{fontSize:'10px',opacity:0.5}}>POKER{isMultiplayer ? " MP" : ""}</span></div>
        <div className="nav-tabs">
          <button className={`nav-tab ${tab === 'game' ? 'active' : ''}`} onClick={() => setTab('game')}>Table</button>
          <button className={`nav-tab ${tab === 'leaderboard' ? 'active' : ''}`} onClick={() => { setTab('leaderboard'); loadLeaderboard(); }}>Ranks</button>
        </div>
        <div className="nav-user">
          <span className="nav-chips">⬣ {playerChips.toLocaleString()}</span>
          <span className="nav-email">{email}</span>
          <button className="nav-logout" onClick={() => { if (isMultiplayer) { postToParent({ type: "poker-leave", tableId: MP_TABLE_ID }); } else { setScreen('login'); setGameState(null); } }}>{isMultiplayer ? "Leave" : "Exit"}</button>
        </div>
      </div>

      {/* GAME TAB */}
      {tab === "game" && (
        <div className="game-area">
          {!gameState ? (
            <div style={{ textAlign: 'center', marginTop: '80px' }}>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '14px', letterSpacing: '4px', color: 'var(--theme-accent-primary)', marginBottom: '24px', textTransform: 'uppercase' }}>
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
                    <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '12px', color: gameState.isPlayerTurn ? 'var(--theme-accent-primary)' : 'var(--theme-text-secondary)' }}>
                      {displayName} {gameState.playerFolded ? '(Folded)' : gameState.isPlayerTurn ? '⟨ Your Turn ⟩' : ''}
                    </span>
                    <span className="player-chip-count">⬣ {playerChips.toLocaleString()}</span>
                    {gameState.playerBet > 0 && (
                      <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '12px', color: 'var(--theme-accent-primary)' }}>
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
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--theme-text-muted)' }}>No warriors yet. Be the first.</td></tr>
              ) : leaderboard.map((p, i) => (
                <tr key={p.emailHash || p.email} className={(p.emailHash === hashEmail(email)) || p.email === email ? 'lb-you' : ''}>
                  <td className={`lb-rank ${i === 0 ? 'lb-rank-1' : i === 1 ? 'lb-rank-2' : i === 2 ? 'lb-rank-3' : ''}`}>{i + 1}</td>
                  <td className="lb-email">{p.displayName || (p.email ? p.email.split("@")[0] : "Unknown")}</td>
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
