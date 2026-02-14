import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

/**
 * Returns the configured AI model for structured generation (AI SDK).
 *
 * Priority:
 *   1. If AI_PROVIDER=gemini → use Gemini
 *   2. If ANTHROPIC_API_KEY is missing but GEMINI_API_KEY is set → use Gemini
 *   3. Otherwise → use Anthropic (default)
 *
 * Env vars:
 *   AI_PROVIDER       — "anthropic" | "gemini" (default: "anthropic")
 *   GEMINI_API_KEY     — Google AI API key
 *   GEMINI_MODEL       — Gemini model ID (default: "gemini-2.5-flash")
 *   ANTHROPIC_API_KEY  — Anthropic API key
 *   ANTHROPIC_MODEL    — Anthropic model ID (default: "claude-sonnet-4-5-20250929")
 */
export function getModel(): LanguageModel {
  const provider = resolveProvider();

  if (provider === "gemini") {
    const modelId = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    console.log(`[AI] Using Gemini model: ${modelId}`);
    return google(modelId);
  }

  const modelId =
    process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";
  console.log(`[AI] Using Anthropic model: ${modelId}`);
  return anthropic(modelId);
}

/**
 * Resolve which provider to use based on env vars.
 */
export function resolveProvider(): "anthropic" | "gemini" {
  const explicit = process.env.AI_PROVIDER?.toLowerCase();

  if (explicit === "gemini") return "gemini";
  if (explicit === "anthropic") return "anthropic";

  // Auto-fallback: if no Anthropic key but Gemini key exists, use Gemini
  if (!process.env.ANTHROPIC_API_KEY && process.env.GEMINI_API_KEY) {
    return "gemini";
  }

  return "anthropic";
}

/**
 * Get the model ID string for direct SDK usage (e.g., voice bridge).
 */
export function getModelId(): string {
  const provider = resolveProvider();
  if (provider === "gemini") {
    return process.env.GEMINI_MODEL || "gemini-2.5-flash";
  }
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";
}
