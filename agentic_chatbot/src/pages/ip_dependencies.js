// Local testing ke liye true, deploy ke waqt false
const USE_LOCAL = false;

export const OLLAMA_BASE_URL = USE_LOCAL
  ? "http://localhost:8002"
  : "https://agentic-ai-j16p.onrender.com";

export const model_endpoint = `${OLLAMA_BASE_URL}/model_list`;
export const chat_endpoint = `${OLLAMA_BASE_URL}/chat`;