import Anthropic from "@anthropic-ai/sdk";

export const config = {
  api: {
    bodyParser: false // we'll parse manually to avoid crashes
  }
};

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const wins = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

function getWinner(board){
  for (const [a,b,c] of wins){
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

function empties(board){
  const out = [];
  for (let i=0;i<9;i++) if (board[i] === null) out.push(i);
  return out;
}

function opponent(p){ return p === "X" ? "O" : "X"; }

function isTerminal(board){
  const w = getWinner(board);
  if (w) return { done:true, winner:w };
  if (empties(board).length === 0) return { done:true, winner:null };
  return { done:false, winner:null };
}

function minimax(board, currentPlayer, maximizingFor){
  const term = isTerminal(board);
  if (term.done){
    if (term.winner === maximizingFor) return { score: 10 };
    if (term.winner === opponent(maximizingFor)) return { score: -10 };
    return { score: 0 };
  }

  const moves = [];
  for (const i of empties(board)){
    const next = board.slice();
    next[i] = currentPlayer;
    const r = minimax(next, opponent(currentPlayer), maximizingFor);
    moves.push({ i, score: r.score });
  }

  const isMaxTurn = currentPlayer === maximizingFor;
  let best = moves[0];
  for (const m of moves){
    if (isMaxTurn){
      if (m.score > best.score) best = m;
    } else {
      if (m.score < best.score) best = m;
    }
  }
  return best;
}

function minimaxBestMove(board, player){
  const e = empties(board);
  if (!e.length) return -1;
  return minimax(board, player, player).i;
}

function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function lineHasThreat(board, line, p){
  const vals = line.map(i => board[i]);
  return vals.filter(v => v === p).length === 2 && vals.includes(null);
}
function lineEmptyIndex(board, line){
  for (const i of line) if (board[i] === null) return i;
  return -1;
}

function classifyMove(boardBefore, moveIndex, player){
  const opp = opponent(player);

  // winning?
  const b1 = boardBefore.slice();
  b1[moveIndex] = player;
  if (getWinner(b1) === player) return "win";

  // block?
  for (const line of wins){
    if (lineHasThreat(boardBefore, line, opp)){
      if (lineEmptyIndex(boardBefore, line) === moveIndex) return "block";
    }
  }

  if (moveIndex === 4) return "center";
  if ([0,2,6,8].includes(moveIndex)) return "corner";

  // fork-ish
  const b2 = boardBefore.slice();
  b2[moveIndex] = player;
  let threats = 0;
  for (const line of wins) if (lineHasThreat(b2, line, player)) threats++;
  if (threats >= 2) return "fork";

  return "pressure";
}

function aiCoverReason(boardBefore, moveIndex, player, personality="balanced"){
  const kind = classifyMove(boardBefore, moveIndex, player);

  const cold = {
    win:["Terminal line acquired.","Converting advantage to win.","Closing sequence executed."],
    block:["Threat neutralized.","Blocking forced line.","Defensive parity restored."],
    center:["Center control secured.","Maximizing branching factor.","Establishing central dominance."],
    corner:["Corner claimed for future lines.","Expanding win conditions.","Corner pressure applied."],
    fork:["Fork vector created.","Multiple threats established.","Dual-line pressure initialized."],
    pressure:["Optimizing position.","Reducing opponent options.","Advantage maintained."]
  };

  const balanced = {
    win:["Taking the winning line.","Finishing the sequence.","Locking in the win."],
    block:["Blocking your immediate threat.","Cutting off that win route.","Defusing your next move."],
    center:["Center is the best control point.","Taking the center for tempo.","Center control improves options."],
    corner:["Corners create strong threats.","Corner position sets up lines.","Taking a corner for pressure."],
    fork:["Setting up multiple threats.","Creating a fork opportunity.","Forcing you into defense."],
    pressure:["Improving my position.","Keeping pressure on.","Maintaining advantage."]
  };

  const chaos = {
    win:["I saw the opening. I took it. 😈","Boom. Line completed.","Checkmate energy. (Wrong game.) Still counts."],
    block:["Not today. 🔒","Snip. Threat removed.","You almost had it—almost."],
    center:["Center = vibes = control.","Claiming the core node.","I want the middle. It looks important."],
    corner:["Corners are spicy. I pick spicy.","Corner camping… strategically.","Edge tactics engaged."],
    fork:["Forked. Good luck.","Two threats. Maximum panic.","I’m making you choose pain."],
    pressure:["Chaos with a plan.","Applying pressure. For science.","I’m cooking…"]
  };

  const table = personality === "cold" ? cold : personality === "chaos" ? chaos : balanced;
  return pick(table[kind] || balanced.pressure);
}

function chooseFallbackMove(board, player, personality="balanced"){
  const e = empties(board);
  if (!e.length) return -1;
  if (personality === "chaos" && Math.random() < 0.25) return pick(e);
  return minimaxBestMove(board, player);
}

// Robust body parsing for Vercel serverless
async function readJsonBody(req){
  // If Vercel already parsed it (sometimes happens), use it.
  if (req.body && typeof req.body === "object") return req.body;

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export default async function handler(req, res){
  // CORS headers are harmless even same-origin
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") return res.status(200).json({ ok: true, hint: "POST JSON to this endpoint" });

  const started = Date.now();

  try{
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

    const body = await readJsonBody(req);
    const board = body.board;
    const player = body.player;
    const personality = body.personality || "balanced";

    if (!Array.isArray(board) || board.length !== 9) {
      return res.status(400).json({ error: "board must be array length 9" });
    }
    if (player !== "X" && player !== "O") {
      return res.status(400).json({ error: 'player must be "X" or "O"' });
    }

    const w = getWinner(board);
    const e = empties(board);
    if (w || e.length === 0) return res.status(200).json({ i: -1, why: "Session complete." });

    // If API key missing, fallback silently
    if (!process.env.ANTHROPIC_API_KEY){
      const idx = chooseFallbackMove(board, player, personality);
      return res.status(200).json({ i: idx, why: aiCoverReason(board, idx, player, personality), ms: Date.now()-started });
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

    const timeoutMs = 12000;
    const timeoutPromise = new Promise((_, reject)=>
      setTimeout(()=>reject(new Error("Claude timeout")), timeoutMs)
    );

    const msg = await Promise.race([
      anthropic.messages.create({
        model,
        max_tokens: 140,
        messages: [{ role:"user", content: prompt }]
      }),
      timeoutPromise
    ]);

    const text = (msg?.content?.[0]?.text || "").trim();
    const parsed = JSON.parse(text);

    const idx = parsed.index;
    if (!Number.isInteger(idx) || idx < 0 || idx > 8) throw new Error("Invalid index");
    if (board[idx] !== null) throw new Error("Non-empty cell");

    const why = (parsed.reason && String(parsed.reason).trim())
      ? String(parsed.reason).trim()
      : aiCoverReason(board, idx, player, personality);

    return res.status(200).json({ i: idx, why, ms: Date.now()-started });

  } catch (err){
    // Never crash: fallback silently
    try{
      const body = await readJsonBody(req);
      const board = Array.isArray(body.board) ? body.board : Array(9).fill(null);
      const player = (body.player === "X" || body.player === "O") ? body.player : "O";
      const personality = typeof body.personality === "string" ? body.personality : "balanced";
      const idx = chooseFallbackMove(board, player, personality);
      return res.status(200).json({ i: idx, why: aiCoverReason(board, idx, player, personality), ms: Date.now()-started });
    } catch {
      return res.status(200).json({ i: 0, why: "Initializing response.", ms: Date.now()-started });
    }
  }
}
