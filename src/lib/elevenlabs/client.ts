/**
 * ElevenLabs Conversational AI WebSocket Client
 *
 * Handles the WebSocket connection to ElevenLabs for voice-based check-ins.
 * This runs client-side in the browser.
 */

export interface ElevenLabsConfig {
  signedUrl: string;
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  onAgentResponse?: (response: string) => void;
  onAudioChunk?: (audioBase64: string) => void;
  onError?: (error: string) => void;
  onDisconnect?: () => void;
}

export class ElevenLabsClient {
  private ws: WebSocket | null = null;
  private config: ElevenLabsConfig;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;

  constructor(config: ElevenLabsConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.config.signedUrl);

      this.ws.onopen = () => {
        this.ws?.send(
          JSON.stringify({
            type: "conversation_initiation_client_data",
          })
        );
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch {
          console.error("Failed to parse ElevenLabs message");
        }
      };

      this.ws.onerror = () => {
        this.config.onError?.("WebSocket connection error");
        reject(new Error("WebSocket connection failed"));
      };

      this.ws.onclose = () => {
        this.config.onDisconnect?.();
      };
    });
  }

  private handleMessage(message: Record<string, unknown>) {
    switch (message.type) {
      case "ping":
        this.ws?.send(
          JSON.stringify({
            type: "pong",
            event_id: message.ping_event
              ? (message.ping_event as Record<string, unknown>).event_id
              : undefined,
          })
        );
        break;

      case "user_transcript": {
        const transcriptEvent = message.user_transcription_event as Record<string, unknown>;
        if (transcriptEvent) {
          this.config.onTranscript?.(
            transcriptEvent.user_transcript as string,
            !!(message as Record<string, unknown>).is_final
          );
        }
        break;
      }

      case "agent_response": {
        const responseEvent = message.agent_response_event as Record<string, unknown>;
        if (responseEvent) {
          this.config.onAgentResponse?.(responseEvent.agent_response as string);
        }
        break;
      }

      case "audio": {
        const audioEvent = message.audio_event as Record<string, unknown>;
        if (audioEvent) {
          this.config.onAudioChunk?.(audioEvent.audio_base_64 as string);
        }
        break;
      }

      case "interruption":
        // Agent was interrupted, handle gracefully
        break;

      default:
        break;
    }
  }

  /**
   * Start capturing microphone audio and streaming to ElevenLabs
   */
  async startMicrophone(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.audioContext = new AudioContext({ sampleRate: 16000 });
    const source = this.audioContext.createMediaStreamSource(stream);
    const processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    source.connect(processor);
    processor.connect(this.audioContext.destination);

    processor.onaudioprocess = (e) => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7fff;
      }

      const base64 = btoa(
        String.fromCharCode(...new Uint8Array(pcm16.buffer))
      );

      this.ws.send(JSON.stringify({ user_audio_chunk: base64 }));
    };

    this.mediaRecorder = null; // We use ScriptProcessor instead
  }

  /**
   * Send contextual information to the agent
   */
  sendContext(text: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "contextual_update",
          text,
        })
      );
    }
  }

  /**
   * Disconnect from the WebSocket and clean up resources
   */
  disconnect(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

/**
 * Play base64-encoded audio chunk through the browser's audio system
 */
export async function playAudioChunk(
  audioBase64: string,
  audioContext: AudioContext
): Promise<void> {
  const binaryString = atob(audioBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  try {
    const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start(0);
  } catch {
    // Raw PCM data - play directly
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 0x7fff;
    }
    const audioBuffer = audioContext.createBuffer(1, float32.length, 16000);
    audioBuffer.getChannelData(0).set(float32);
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start(0);
  }
}
