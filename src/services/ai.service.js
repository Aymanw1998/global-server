import axios from "axios";

const getAIServiceUrl = () =>
  (process.env.AI_SERVICE_URL || "http://localhost:7000").replace(/\/+$/, "");

export async function forwardChatToAIService({ message, context = {}, project }) {
  const aiServiceUrl = getAIServiceUrl();

  console.log("[Global Server] Forwarding request to AI service", {
    url: `${aiServiceUrl}/api/ai/chat`,
    project,
    source: "global-server",
    message,
    context,
  });

  const { data } = await axios.post(
    `${aiServiceUrl}/api/ai/chat`,
    {
      message,
      context,
      project,
      source: "global-server",
    },
    {
      timeout: 60000,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  console.log("[Global Server] Response received from AI service", {
    project,
    data,
  });

  return data;
}
