import WebSocket from "ws";
import { LLMClient } from "./llm";

/**
 * Voice pipeline bridge: Discord Audio → ElevenLabs STT → LLM → ElevenLabs TTS → Discord Audio
 *
 * Flow:
 *   1. Accumulate PCM audio from Discord mic
 *   2. On silence: send audio to ElevenLabs STT API → get text
 *   3. Send text + conversation history to LLM (Anthropic or Gemini) → get response
 *   4. Stream response text to ElevenLabs TTS WebSocket → get audio chunks
 *   5. Play audio chunks back in Discord
 */

const ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const ELEVENLABS_TTS_WS_BASE =
  "wss://api.elevenlabs.io/v1/text-to-speech";

export interface VoiceBridgeConfig {
  elevenLabsApiKey: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
  voiceId?: string; // ElevenLabs voice ID for TTS (default: Matilda)
  ttsModelId?: string; // ElevenLabs TTS model
  developerName: string;
  systemPrompt: string;
  onTranscript?: (text: string) => void;
  onAgentResponse?: (text: string) => void;
  onAgentAudio?: (pcmBuffer: Buffer) => void;
  onError?: (error: string) => void;
  onProcessing?: (stage: "stt" | "llm" | "tts") => void;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export class VoiceBridge {
  private config: VoiceBridgeConfig;
  private llm: LLMClient;
  private conversationHistory: ConversationMessage[] = [];
  private ttsWs: WebSocket | null = null;
  private isProcessing = false;
  private voiceId: string;
  private ttsModelId: string;

  constructor(config: VoiceBridgeConfig) {
    this.config = config;
    this.voiceId = config.voiceId || "Xb7hH8MSUJpSbSDYk0k2"; // Matilda
    this.ttsModelId = config.ttsModelId || "eleven_flash_v2_5";
    this.llm = new LLMClient({
      anthropicApiKey: config.anthropicApiKey,
      geminiApiKey: config.geminiApiKey,
    });
  }

  /**
   * Process a complete utterance: STT → Claude → TTS
   * @param pcmAudio - Complete PCM audio buffer (16-bit LE, 16kHz mono)
   */
  async processUtterance(pcmAudio: Buffer): Promise<void> {
    if (this.isProcessing) {
      console.log("[Pipeline] Already processing, skipping this audio");
      return;
    }

    this.isProcessing = true;
    console.log("[Pipeline] Started processing utterance");

    try {
      // Step 1: Speech-to-Text
      this.config.onProcessing?.("stt");
      const transcript = await this.speechToText(pcmAudio);

      if (!transcript || transcript.trim().length === 0) {
        console.log("[STT] Empty transcript, skipping...");
        this.isProcessing = false;
        return;
      }

      // Filter out very short transcripts (likely noise)
      if (transcript.trim().length < 5) {
        console.log(`[STT] Transcript too short ("${transcript}"), skipping...`);
        this.isProcessing = false;
        return;
      }

      console.log(`[STT] ${this.config.developerName}: ${transcript}`);
      this.config.onTranscript?.(transcript);
      this.conversationHistory.push({ role: "user", content: transcript });

      // Step 2: LLM response
      this.config.onProcessing?.("llm");
      const response = await this.getLLMResponse(transcript);

      if (!response) {
        console.log("[LLM] Empty response, skipping...");
        this.isProcessing = false;
        return;
      }

      console.log(`[LLM] Mastr: ${response}`);
      this.config.onAgentResponse?.(response);
      this.conversationHistory.push({ role: "assistant", content: response });

      // Step 3: Text-to-Speech via WebSocket streaming
      this.config.onProcessing?.("tts");
      await this.textToSpeechStream(response);

      console.log("[Pipeline] Finished processing utterance");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[Pipeline] Error:", msg);
      this.config.onError?.(msg);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Send audio to ElevenLabs STT API
   */
  private async speechToText(pcmAudio: Buffer): Promise<string> {
    // Convert PCM to WAV format for the API
    const wavBuffer = this.pcmToWav(pcmAudio, 16000, 1, 16);

    const formData = new FormData();
    formData.append(
      "file",
      new Blob([wavBuffer as unknown as ArrayBuffer], { type: "audio/wav" }),
      "audio.wav"
    );
    formData.append("model_id", "scribe_v1");

    const res = await fetch(ELEVENLABS_STT_URL, {
      method: "POST",
      headers: {
        "xi-api-key": this.config.elevenLabsApiKey,
      },
      body: formData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`STT API error (${res.status}): ${errorText}`);
    }

    const data = (await res.json()) as { text?: string };
    return data.text || "";
  }

  /**
   * Get LLM response given the conversation history
   */
  private async getLLMResponse(_userMessage: string): Promise<string> {
    return this.llm.chat(
      this.config.systemPrompt,
      this.conversationHistory,
      1000 // Increased from 300 to allow complete responses
    );
  }

  /**
   * Stream text to ElevenLabs TTS WebSocket, accumulate all audio,
   * then emit the complete buffer via onAgentAudio.
   *
   * Uses pcm_24000 (24kHz mono 16-bit) - the handler upsamples to 48kHz stereo for Discord.
   */
  private async textToSpeechStream(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `${ELEVENLABS_TTS_WS_BASE}/${this.voiceId}/stream-input?model_id=${this.ttsModelId}&output_format=pcm_24000`;

      // Auth via headers, matching the ElevenLabs example
      const ws = new WebSocket(wsUrl, {
        headers: { "xi-api-key": this.config.elevenLabsApiKey },
      });
      this.ttsWs = ws;
      let resolved = false;
      const audioChunks: Buffer[] = [];

      const cleanup = () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        this.ttsWs = null;
      };

      const emitAccumulatedAudio = () => {
        if (audioChunks.length > 0) {
          const fullAudio = Buffer.concat(audioChunks);
          console.log(
            `[TTS] Emitting ${audioChunks.length} chunks, ${fullAudio.length} bytes (${(fullAudio.length / (24000 * 2)).toFixed(1)}s of audio)`
          );
          this.config.onAgentAudio?.(fullAudio);
        } else {
          console.log("[TTS] No audio chunks received!");
        }
      };

      ws.on("open", () => {
        console.log("[TTS] WebSocket connected, sending text...");

        // BOS (beginning of stream) - voice settings only, auth is in headers
        ws.send(
          JSON.stringify({
            text: " ",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          })
        );

        // Send the full text
        ws.send(
          JSON.stringify({
            text: text,
          })
        );

        // EOS (end of stream) - empty string signals we're done sending text
        ws.send(
          JSON.stringify({
            text: "",
          })
        );
      });

      ws.on("message", (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.audio) {
            const chunk = Buffer.from(message.audio, "base64");
            audioChunks.push(chunk);
          }

          if (message.error) {
            console.error("[TTS] Server error:", message.error);
          }

          if (message.isFinal) {
            console.log("[TTS] Received isFinal signal");
            emitAccumulatedAudio();
            resolved = true;
            cleanup();
            resolve();
          }
        } catch {
          // Binary data - might be raw audio depending on format
          if (Buffer.isBuffer(data)) {
            audioChunks.push(data);
          }
        }
      });

      ws.on("error", (err) => {
        console.error("[TTS] WebSocket error:", err.message);
        cleanup();
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      ws.on("close", (code, reason) => {
        console.log(
          `[TTS] WebSocket closed (code=${code}, reason=${reason?.toString() || "none"}, chunks=${audioChunks.length})`
        );
        if (!resolved) {
          emitAccumulatedAudio();
          resolved = true;
        }
        cleanup();
        resolve();
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (!resolved) {
          console.log("[TTS] Timeout - emitting what we have");
          emitAccumulatedAudio();
          resolved = true;
          cleanup();
          resolve();
        }
      }, 30_000);
    });
  }

  /**
   * Convert raw PCM data to WAV format
   */
  private pcmToWav(
    pcmData: Buffer,
    sampleRate: number,
    channels: number,
    bitsPerSample: number
  ): Buffer {
    const byteRate = (sampleRate * channels * bitsPerSample) / 8;
    const blockAlign = (channels * bitsPerSample) / 8;
    const dataSize = pcmData.length;
    const headerSize = 44;
    const wav = Buffer.alloc(headerSize + dataSize);

    // RIFF header
    wav.write("RIFF", 0);
    wav.writeUInt32LE(36 + dataSize, 4);
    wav.write("WAVE", 8);

    // fmt sub-chunk
    wav.write("fmt ", 12);
    wav.writeUInt32LE(16, 16); // sub-chunk size
    wav.writeUInt16LE(1, 20); // PCM format
    wav.writeUInt16LE(channels, 22);
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(byteRate, 28);
    wav.writeUInt16LE(blockAlign, 32);
    wav.writeUInt16LE(bitsPerSample, 34);

    // data sub-chunk
    wav.write("data", 36);
    wav.writeUInt32LE(dataSize, 40);
    pcmData.copy(wav, 44);

    return wav;
  }

  /**
   * Trigger the agent to speak first (greeting)
   */
  async greet(): Promise<void> {
    const greeting = await this.getGreeting();
    if (greeting) {
      this.config.onAgentResponse?.(greeting);
      this.conversationHistory.push({ role: "assistant", content: greeting });
      await this.textToSpeechStream(greeting);
    }
  }

  private async getGreeting(): Promise<string> {
    return this.llm.chat(
      this.config.systemPrompt,
      [
        {
          role: "user",
          content: `[System: The developer "${this.config.developerName}" just joined the voice channel for their daily check-in. Greet them warmly and ask how things are going. Keep it brief - 1-2 sentences.]`,
        },
      ],
      300 // Increased from 150 to allow complete greetings
    );
  }

  /**
   * Get the full conversation transcript
   */
  getTranscript(): string {
    return this.conversationHistory
      .map(
        (m) =>
          `${m.role === "assistant" ? "Mastr" : this.config.developerName}: ${m.content}`
      )
      .join("\n");
  }

  /**
   * Check if the bridge is currently processing audio
   */
  get busy(): boolean {
    return this.isProcessing;
  }

  /**
   * Disconnect and clean up
   */
  disconnect(): void {
    if (this.ttsWs) {
      this.ttsWs.close();
      this.ttsWs = null;
    }
  }
}
