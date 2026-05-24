import axios from "axios";

const getAIServiceUrl = () =>
  (process.env.AI_SERVICE_URL || "http://localhost:7000").replace(/\/+$/, "");

export async function forwardChatToAIService({ message, context = {}, project }) {
  const { data } = await axios.post(
    `${getAIServiceUrl()}/api/ai/chat`,
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

  return data;
}
