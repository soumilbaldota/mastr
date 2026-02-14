import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface LLMConfig {
  anthropicApiKey?: string;
  geminiApiKey?: string;
  provider?: "anthropic" | "gemini";
  anthropicModel?: string;
  geminiModel?: string;
}

/**
 * Unified LLM client that supports Anthropic and Gemini.
 * Used by the voice bridge for conversational responses.
 */
export class LLMClient {
  private provider: "anthropic" | "gemini";
  private anthropic?: Anthropic;
  private gemini?: GoogleGenerativeAI;
  private modelId: string;

  constructor(config: LLMConfig) {
    this.provider = config.provider || resolveProvider(config);

    if (this.provider === "gemini") {
      const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is required when using Gemini provider");
      this.gemini = new GoogleGenerativeAI(apiKey);
      this.modelId = config.geminiModel || process.env.GEMINI_MODEL || "gemini-2.5-flash";
      console.log(`[LLM] Using Gemini: ${this.modelId}`);
    } else {
      const apiKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required when using Anthropic provider");
      this.anthropic = new Anthropic({ apiKey });
      this.modelId = config.anthropicModel || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";
      console.log(`[LLM] Using Anthropic: ${this.modelId}`);
    }
  }

  /**
   * Get a chat completion given a system prompt and conversation history.
   */
  async chat(
    systemPrompt: string,
    messages: ChatMessage[],
    maxTokens: number = 300
  ): Promise<string> {
    if (this.provider === "gemini") {
      return this.chatGemini(systemPrompt, messages, maxTokens);
    }
    return this.chatAnthropic(systemPrompt, messages, maxTokens);
  }

  private async chatAnthropic(
    systemPrompt: string,
    messages: ChatMessage[],
    maxTokens: number
  ): Promise<string> {
    const response = await this.anthropic!.messages.create({
      model: this.modelId,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    // Check if response was truncated
    if (response.stop_reason === "max_tokens") {
      console.warn(
        `[LLM] Response truncated due to max_tokens limit (${maxTokens}). Consider increasing the limit.`
      );
    }

    const textBlock = response.content.find((block) => block.type === "text");
    return textBlock ? textBlock.text : "";
  }

  private async chatGemini(
    systemPrompt: string,
    messages: ChatMessage[],
    maxTokens: number
  ): Promise<string> {
    const model = this.gemini!.getGenerativeModel({
      model: this.modelId,
      systemInstruction: systemPrompt,
      generationConfig: {
        maxOutputTokens: maxTokens,
      },
    });

    // Convert messages to Gemini format (user/model)
    // Note: Gemini uses "user" for user messages and "model" for assistant messages
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history });
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage) return "";

    const result = await chat.sendMessage(lastMessage.content);
    const responseText = result.response.text() || "";

    // Check if response was truncated
    const finishReason = result.response.candidates?.[0]?.finishReason;
    if (finishReason === "MAX_TOKENS") {
      console.warn(
        `[LLM] Gemini response truncated due to MAX_TOKENS limit (${maxTokens}). Consider increasing the limit.`
      );
    }

    return responseText;
  }
}

function resolveProvider(config: LLMConfig): "anthropic" | "gemini" {
  const explicit = process.env.AI_PROVIDER?.toLowerCase();
  if (explicit === "gemini") return "gemini";
  if (explicit === "anthropic") return "anthropic";

  // Auto-fallback
  const hasAnthropic = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  const hasGemini = config.geminiApiKey || process.env.GEMINI_API_KEY;

  if (!hasAnthropic && hasGemini) return "gemini";
  return "anthropic";
}
