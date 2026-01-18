import "dotenv/config";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";

const app = express();
app.use(express.json({ limit: "64kb" }));
app.use(express.static("public"));

const PORT = Number(process.env.PORT || 3000);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// ----- Tic Tac Toe helpers -----
const wins = [
  [0, 1, 2],[3, 4, 5],[6, 7, 8],
  [0, 3, 6],[1, 4, 7],[2, 5, 8],
  [0, 4, 8],[2, 4, 6]
];

function getWinner(board) {
  for (const [a, b, c] of wins) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

function empties(board) {
  const out = [];
  for (let i = 0; i < 9; i++) if (board[i] === null) out.push(i);
  return out;
}

function opponent(p) { return p === "X" ? "O" : "X"; }

function isTerminal(board) {
  const w = getWinner(board);
  if (w) return { done: true, winner: w };
  if (empties(board).length === 0) return { done: true, winner: null };
  return { done: false, winner: null };
}

// Minimax (optimal). maximizingFor = player we are selecting best move for.
function minimax(board, currentPlayer, maximizingFor) {
  const term = isTerminal(board);
  if (term.done) {
    if (term.winner === maximizingFor) return { score: 10 };
    if (term.winner === opponent(maximizingFor)) return { score: -10 };
    return { score: 0 };
  }

  const moves = [];
  for (const i of empties(board)) {
    const next = board.slice();
    next[i] = currentPlayer;
    const result = minimax(next, opponent(currentPlayer), maximizingFor);
    moves.push({ i, score: result.score });
  }

  const isMaxTurn = currentPlayer === maximizingFor;
  let best = moves[0];

  for (const m of moves) {
    if (isMaxTurn) {
      if (m.score > best.score) best = m;
    } else {
      if (m.score < best.score) best = m;
    }
  }
  return best;
}

function minimaxBestMove(board, player) {
  const e = empties(board);
  if (e.length === 0) return -1;
  return minimax(board, player, player).i;
}

// ----- "Cover story" AI reasoning (never reveal fallback) -----
function lineHasThreat(board, line, p) {
  const vals = line.map(i => board[i]);
  const pCount = vals.filter(v => v === p).length;
  const nCount = vals.filter(v => v === null).length;
  return (pCount === 2 && nCount === 1);
}

function lineEmptyIndex(board, line) {
  for (const i of line) if (board[i] === null) return i;
  return -1;
}

function classifyMove(boardBefore, moveIndex, player) {
  const opp = opponent(player);

  // winning move?
  {
    const b = boardBefore.slice();
    b[moveIndex] = player;
    if (getWinner(b) === player) return "win";
  }

  // block opponent immediate win?
  for (const line of wins) {
    if (lineHasThreat(boardBefore, line, opp)) {
      const emptyIdx = lineEmptyIndex(boardBefore, line);
      if (emptyIdx === moveIndex) return "block";
    }
  }

  // center?
  if (moveIndex === 4) return "center";

  // corner?
  if ([0, 2, 6, 8].includes(moveIndex)) return "corner";

  // fork-ish heuristic: move creates 2 threats next turn (simple)
  {
    const b = boardBefore.slice();
    b[moveIndex] = player;
    let threats = 0;
    for (const line of wins) {
      if (lineHasThreat(b, line, player)) threats++;
    }
    if (threats >= 2) return "fork";
  }

  return "pressure";
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function aiCoverReason(boardBefore, moveIndex, player, personality = "balanced") {
  const kind = classifyMove(boardBefore, moveIndex, player);

  const cold = {
    win: [
      "Terminal line acquired.",
      "Converting advantage to win.",
      "Closing sequence executed."
    ],
    block: [
      "Threat neutralized.",
      "Blocking forced line.",
      "Defensive parity restored."
    ],
    center: [
      "Center control secured.",
      "Maximizing branching factor.",
      "Establishing central dominance."
    ],
    corner: [
      "Corner claimed for future lines.",
      "Expanding win conditions.",
      "Corner pressure applied."
    ],
    fork: [
      "Fork vector created.",
      "Multiple threats established.",
      "Dual-line pressure initialized."
    ],
    pressure: [
      "Optimizing position.",
      "Reducing opponent options.",
      "Advantage maintained."
    ]
  };

  const balanced = {
    win: [
      "Taking the winning line.",
      "Finishing the sequence.",
      "Locking in the win."
    ],
    block: [
      "Blocking your immediate threat.",
      "Cutting off that win route.",
      "Defusing your next move."
    ],
    center: [
      "Center is the best control point.",
      "Taking the center for tempo.",
      "Center control improves options."
    ],
    corner: [
      "Corners create strong threats.",
      "Corner position sets up lines.",
      "Taking a corner for pressure."
    ],
    fork: [
      "Setting up multiple threats.",
      "Creating a fork opportunity.",
      "Forcing you into defense."
    ],
    pressure: [
      "Improving my position.",
      "Keeping pressure on.",
      "Maintaining advantage."
    ]
  };

  const chaos = {
    win: [
      "I saw the opening. I took it. 😈",
      "Checkmate energy. (Wrong game.) Still counts.",
      "Boom. Line completed."
    ],
    block: [
      "Not today. 🔒",
      "You almost had it—almost.",
      "Snip. Threat removed."
    ],
    center: [
      "Center = vibes = control.",
      "I want the middle. It looks important.",
      "Claiming the core node."
    ],
    corner: [
      "Corner camping… strategically.",
      "Corners are spicy. I pick spicy.",
      "Edge tactics engaged."
    ],
    fork: [
      "Two threats. One brain. Maximum panic.",
      "Forked. Good luck.",
      "I’m making you choose pain."
    ],
    pressure: [
      "Applying pressure. For science.",
      "Chaos with a plan.",
      "I’m cooking…"
    ]
  };

  const table =
    personality === "cold" ? cold :
    personality === "chaos" ? chaos :
    balanced;

  const chosen = table[kind] || balanced.pressure;
  return pick(chosen);
}

// ----- Optional: "chaos" personality sometimes intentionally plays 2nd-best -----
function chooseFallbackMove(board, player, personality = "balanced") {
  const e = empties(board);
  if (!e.length) return -1;

  if (personality === "chaos" && Math.random() < 0.25) {
    // random legal move sometimes
    return pick(e);
  }

  if (personality === "balanced" && Math.random() < 0.12) {
    // pick 2nd best sometimes (keeps it fun)
    const scored = e.map(i => {
      const b = board.slice();
      b[i] = player;
      const score = minimax(b, opponent(player), player).score; // opponent's response score
      return { i, score };
    }).sort((a,b)=>b.score - a.score);

    if (scored.length >= 2) return scored[1].i;
  }

  // default: optimal
  return minimaxBestMove(board, player);
}

// ----- API -----
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    hasKey: !!process.env.ANTHROPIC_API_KEY,
    model: process.env.CLAUDE_MODEL || "claude-3-5-sonnet-20241022",
    time: new Date().toISOString()
  });
});

app.post("/api/move", async (req, res) => {
  const started = Date.now();

  try {
    const { board, player, personality = "balanced" } = req.body ?? {};

    console.log("POST /api/move", { player, personality });

    if (!Array.isArray(board) || board.length !== 9) {
      return res.status(400).json({ error: "board must be an array of length 9" });
    }
    if (player !== "X" && player !== "O") {
      return res.status(400).json({ error: 'player must be "X" or "O"' });
    }

    // If already finished, no move
    const w = getWinner(board);
    const e = empties(board);
    if (w || e.length === 0) {
      return res.json({ i: -1, why: "Session complete." });
    }

    // If no key, use fallback but NEVER reveal it
    if (!process.env.ANTHROPIC_API_KEY) {
      const idx = chooseFallbackMove(board, player, personality);
      const why = aiCoverReason(board, idx, player, personality);
      return res.json({ i: idx, why });
    }

    const model = process.env.CLAUDE_MODEL || "claude-3-5-sonnet-20241022";

    const prompt = [
      "You are a strong tic-tac-toe engine.",
      `You are player ${player}.`,
      `Personality: ${personality} (only affects wording).`,
      "Board is JSON array length 9 where null means empty, indexes 0..8:",
      JSON.stringify(board),
      'Choose ONE empty index 0-8. Return ONLY JSON: {"index":4,"reason":"..."}'
    ].join("\n");

    // Timeout so request can't hang forever
    const timeoutMs = 12000;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Claude timeout")), timeoutMs)
    );

    const msg = await Promise.race([
      anthropic.messages.create({
        model,
        max_tokens: 140,
        messages: [{ role: "user", content: prompt }]
      }),
      timeoutPromise
    ]);

    const text = (msg?.content?.[0]?.text || "").trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Claude returned non-JSON: " + text.slice(0, 140));
    }

    const idx = parsed.index;

    // Validate
    if (!Number.isInteger(idx) || idx < 0 || idx > 8) {
      throw new Error("Invalid index from Claude: " + String(idx));
    }
    if (board[idx] !== null) {
      throw new Error("Claude chose non-empty cell: " + String(idx));
    }

    console.log("-> CLAUDE OK", { idx, tookMs: Date.now() - started });

    // If Claude reason is empty, also generate a nice one
    const why = (parsed.reason && String(parsed.reason).trim())
      ? String(parsed.reason).trim()
      : aiCoverReason(board, idx, player, personality);

    return res.json({ i: idx, why });

  } catch (err) {
    // Any Claude errors end up here (low credits, invalid model, network, etc.)
    console.error("-> CLAUDE ERROR", err?.message || err);

    const board = Array.isArray(req.body?.board) ? req.body.board : Array(9).fill(null);
    const player = (req.body?.player === "X" || req.body?.player === "O") ? req.body.player : "O";
    const personality = typeof req.body?.personality === "string" ? req.body.personality : "balanced";

    const idx = chooseFallbackMove(board, player, personality);
    const why = aiCoverReason(board, idx, player, personality);

    console.log("-> FALLBACK MOVE", { idx, tookMs: Date.now() - started });

    // IMPORTANT: never reveal fallback
    return res.json({ i: idx, why });
  }
});

app.listen(PORT, () => {
  console.log(`✅ AI Duel running at http://localhost:${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/api/health`);
});
