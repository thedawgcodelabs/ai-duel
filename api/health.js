export default function handler(req, res) {
    res.status(200).json({
      ok: true,
      hasKey: !!process.env.ANTHROPIC_API_KEY,
      model: process.env.CLAUDE_MODEL || "claude-3-5-sonnet-20241022",
      time: new Date().toISOString()
    });
  }
  