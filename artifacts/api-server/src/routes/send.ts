import { Router } from "express";

const router = Router();

router.post("/send", async (req, res) => {
  const { channelId, guildId, message } = req.body as {
    channelId?: string;
    guildId?: string;
    message?: string;
  };

  if (!channelId || !message) {
    res.status(400).json({ ok: false, error: "channelId and message are required" });
    return;
  }

  try {
    const resp = await fetch("http://localhost:3001/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, guildId: guildId || undefined, message }),
    });
    const data = await resp.json();
    res.status(resp.ok ? 200 : resp.status).json(data);
  } catch (e) {
    res.status(503).json({ ok: false, error: "Selfbot not reachable. Is it running?" });
  }
});

export default router;
