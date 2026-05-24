import express from "express";

import { forwardChatToAIService } from "../services/ai.service.js";

const router = express.Router();

router.post("/chat", async (req, res) => {
  try {
    const { message, context = {}, project = "global" } = req.body || {};

    if (!message || !String(message).trim()) {
      return res.status(400).json({
        success: false,
        message: "message is required",
      });
    }

    const result = await forwardChatToAIService({
      message: String(message).trim(),
      context,
      project,
    });

    return res.json(result);
  } catch (error) {
    console.error("GLOBAL AI PROXY ERROR FULL:", error);
    console.error("MESSAGE:", error?.message);
    console.error("RESPONSE:", error?.response?.data);

    return res.status(502).json({
      success: false,
      message: "AI service is not available",
    });
  }
});

export default router;
