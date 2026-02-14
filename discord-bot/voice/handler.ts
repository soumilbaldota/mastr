import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  entersState,
  EndBehaviorType,
  StreamType,
  AudioPlayerStatus,
  type VoiceConnection,
  type AudioPlayer,
} from "@discordjs/voice";
import type {
  VoiceBasedChannel,
  Guild,
  GuildMember,
  TextChannel,
  Client,
} from "discord.js";
import { EmbedBuilder } from "discord.js";
import { Transform, Readable } from "stream";
import { OpusEncoder } from "@discordjs/opus";
import { VoiceBridge } from "./elevenlabs-bridge";
import {
  CHECKIN_AGENT_SYSTEM_PROMPT,
  buildContextualPrompt,
  type DeveloperContext,
} from "./prompts";

// Active sessions per guild
const activeSessions = new Map<string, VoiceSession>();

// Store last transcript per guild so /newproject can access it
const guildTranscripts = new Map<string, string>();

interface VoiceSession {
  connection: VoiceConnection;
  player: AudioPlayer;
  bridge: VoiceBridge;
  userId: string;
  voiceChannelId: string;
  textChannel: TextChannel;
  appUrl: string;
  developerId?: string;
  developerName: string;
}

/**
 * Get the last transcript for a guild (used by /newproject command)
 */
export function getLastTranscript(guildId: string): string | undefined {
  return guildTranscripts.get(guildId);
}

/**
 * Register the voiceStateUpdate listener on the Discord client.
 * Call this once during bot startup.
 */
export function registerVoiceStateHandler(client: Client): void {
  client.on("voiceStateUpdate", async (oldState, newState) => {
    // Check if the user LEFT a voice channel
    if (!oldState.channelId || newState.channelId === oldState.channelId) return;

    const guildId = oldState.guild.id;
    const session = activeSessions.get(guildId);
    if (!session) return;

    // If the user who started the check-in left the voice channel
    if (oldState.member?.id === session.userId) {
      console.log(
        `[Voice] Check-in user ${oldState.member.displayName} left the channel, ending session`
      );
      await endVoiceCheckin(guildId);
    }
  });
}

/**
 * Start a voice check-in session.
 * Bot joins the voice channel, listens to the user, runs STT → Claude → TTS pipeline.
 */
export async function startVoiceCheckin(params: {
  voiceChannel: VoiceBasedChannel;
  guild: Guild;
  member: GuildMember;
  textChannel: TextChannel;
  appUrl: string;
  developerId?: string;
  developerContext?: DeveloperContext;
}): Promise<void> {
  const { voiceChannel, guild, member, textChannel, appUrl } = params;

  if (activeSessions.has(guild.id)) {
    await textChannel.send(
      "A check-in is already in progress in this server. Please wait for it to finish."
    );
    return;
  }

  // Build system prompt — use contextual prompt if we have developer context
  const systemPrompt = params.developerContext
    ? buildContextualPrompt(params.developerContext)
    : CHECKIN_AGENT_SYSTEM_PROMPT;

  // Join the voice channel
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
  } catch {
    connection.destroy();
    await textChannel.send(
      "Failed to join the voice channel. Please try again."
    );
    return;
  }

  // Create audio player for bot responses
  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play },
  });
  connection.subscribe(player);

  // Create the voice bridge (STT → LLM → TTS)
  const bridge = new VoiceBridge({
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY!,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    developerName: member.displayName,
    systemPrompt,
    onTranscript: (text) => {
      textChannel.send(`**${member.displayName}:** ${text}`).catch(() => {});
    },
    onAgentResponse: (text) => {
      textChannel.send(`**Mastr:** ${text}`).catch(() => {});
    },
    onAgentAudio: (pcm24kMono) => {
      // Upsample 24kHz mono → 48kHz stereo for Discord and play
      const pcm48kStereo = upsample24kMonoTo48kStereo(pcm24kMono);
      console.log(
        `[Playback] Input: ${pcm24kMono.length} bytes → Output: ${pcm48kStereo.length} bytes (${(pcm48kStereo.length / (48000 * 2 * 2)).toFixed(1)}s)`
      );
      playAudioBuffer(player, pcm48kStereo, connection);
    },
    onError: (error) => {
      console.error("Voice pipeline error:", error);
      textChannel.send(`Voice error: ${error}`).catch(() => {});
    },
    onProcessing: (stage) => {
      const labels = {
        stt: "Transcribing",
        llm: "Thinking",
        tts: "Speaking",
      };
      console.log(`[Pipeline] ${labels[stage]}...`);
    },
  });

  // Store the session
  const session: VoiceSession = {
    connection,
    player,
    bridge,
    userId: member.id,
    voiceChannelId: voiceChannel.id,
    textChannel,
    appUrl,
    developerId: params.developerId,
    developerName: member.displayName,
  };
  activeSessions.set(guild.id, session);

  await textChannel.send(
    `Connected to **${voiceChannel.name}**! Starting check-in with **${member.displayName}**...\n\nType \`/endcheckin\` or leave the voice channel to finish.`
  );

  // Greet the developer (Claude generates greeting → TTS plays it)
  try {
    await bridge.greet();
  } catch (err) {
    console.error("Failed to greet:", err);
  }

  // Start listening to the user's audio
  startListening(connection, member.id, bridge);

  // Handle disconnection - do NOT try to reconnect, just end the session
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    console.log("[Voice] Bot disconnected from voice channel, ending session");
    await endVoiceCheckin(guild.id);
  });

  connection.on(VoiceConnectionStatus.Destroyed, () => {
    activeSessions.delete(guild.id);
  });
}

/**
 * Upsample 24kHz mono 16-bit PCM to 48kHz stereo 16-bit PCM.
 * Ratio is exactly 2x, so each sample is duplicated twice in time,
 * and each time-sample is duplicated for left+right channels.
 */
function upsample24kMonoTo48kStereo(input: Buffer): Buffer {
  const inputSamples = input.length / 2; // 16-bit = 2 bytes per sample
  // Each input sample → 2 time samples × 2 channels = 4 output samples
  const output = Buffer.alloc(inputSamples * 2 * 2 * 2); // *2 time *2 channels *2 bytes

  for (let i = 0; i < inputSamples; i++) {
    const sample = input.readInt16LE(i * 2);
    const outIdx = i * 8; // 4 output samples × 2 bytes each

    // Time sample 1: left + right
    output.writeInt16LE(sample, outIdx);
    output.writeInt16LE(sample, outIdx + 2);
    // Time sample 2: left + right
    output.writeInt16LE(sample, outIdx + 4);
    output.writeInt16LE(sample, outIdx + 6);
  }

  return output;
}

/**
 * Play a complete PCM audio buffer (48kHz stereo 16-bit) through Discord AudioPlayer
 */
function playAudioBuffer(
  player: AudioPlayer,
  pcmBuffer: Buffer,
  connection: VoiceConnection
): void {
  // Feed the buffer through a Readable stream
  let pushed = false;
  const stream = new Readable({
    read() {
      if (!pushed) {
        pushed = true;
        this.push(pcmBuffer);
        this.push(null);
      }
    },
  });

  const resource = createAudioResource(stream, {
    inputType: StreamType.Raw,
  });

  console.log(
    `[Playback] Playing ${pcmBuffer.length} bytes, player status: ${player.state.status}, subscription: ${connection.state.status}`
  );

  player.play(resource);

  player.once(AudioPlayerStatus.Playing, () => {
    console.log("[Playback] AudioPlayer is now Playing");
  });

  player.once(AudioPlayerStatus.Idle, () => {
    console.log("[Playback] AudioPlayer returned to Idle");
  });

  player.once("error", (err) => {
    console.error("[Playback] AudioPlayer error:", err.message);
  });
}

/**
 * Listen to a user's audio, accumulate during speech, and process on silence
 */
function startListening(
  connection: VoiceConnection,
  userId: string,
  bridge: VoiceBridge
): void {
  const receiver = connection.receiver;

  receiver.speaking.on("start", (speakingUserId) => {
    if (speakingUserId !== userId) {
      console.log(`[Audio] Ignoring audio from other user: ${speakingUserId}`);
      return;
    }
    if (bridge.busy) {
      console.log("[Audio] Agent is busy, ignoring audio");
      return;
    }

    const opusStream = receiver.subscribe(speakingUserId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 2000, // Increased from 1.5s to 2s - reduces interruptions
      },
    });

    // Increase max listeners to prevent warnings
    opusStream.setMaxListeners(20);

    // Decode Opus to PCM
    const decoder = new OpusEncoder(48000, 2);
    const audioChunks: Buffer[] = [];

    const pcmTransform = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        try {
          const pcm = decoder.decode(chunk);
          const resampled = resample48kStereoTo16kMono(pcm);
          callback(null, resampled);
        } catch {
          callback();
        }
      },
    });

    opusStream.pipe(pcmTransform);

    pcmTransform.on("data", (pcmChunk: Buffer) => {
      audioChunks.push(pcmChunk);
    });

    pcmTransform.on("end", () => {
      // User stopped speaking - concatenate all audio and process
      if (audioChunks.length === 0) return;

      const fullAudio = Buffer.concat(audioChunks);

      // Minimum audio length check (~1 second at 16kHz mono 16-bit = 32000 bytes)
      // Increased from 0.5s to 1s to filter out background noise better
      if (fullAudio.length < 32000) {
        console.log(
          `[Audio] Too short (${(fullAudio.length / 32000).toFixed(1)}s), skipping...`
        );
        return;
      }

      // Check again if bridge is busy (race condition prevention)
      if (bridge.busy) {
        console.log("[Audio] Agent became busy, skipping this audio");
        return;
      }

      console.log(
        `[Audio] Captured ${(fullAudio.length / 32000).toFixed(1)}s of speech`
      );

      // Process through STT → Claude → TTS pipeline
      bridge.processUtterance(fullAudio).catch((err) => {
        console.error("Utterance processing failed:", err);
      });
    });

    pcmTransform.on("error", (err) => {
      console.error("PCM transform error:", err.message);
    });
  });
}

/**
 * Resample 48kHz stereo 16-bit PCM to 16kHz mono 16-bit PCM
 */
function resample48kStereoTo16kMono(input: Buffer): Buffer {
  const samples = input.length / 2; // 16-bit = 2 bytes per sample
  const stereoSamples = samples / 2; // 2 channels
  const ratio = 3; // 48000 / 16000 = 3
  const outputSamples = Math.floor(stereoSamples / ratio);
  const output = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i++) {
    const srcIdx = i * ratio * 2; // stereo, so *2 channels
    const left = input.readInt16LE(srcIdx * 2);
    const right = input.readInt16LE(srcIdx * 2 + 2);
    const mono = Math.round((left + right) / 2);
    output.writeInt16LE(Math.max(-32768, Math.min(32767, mono)), i * 2);
  }

  return output;
}

/**
 * End a voice check-in session, save transcript, trigger post-processing, disconnect
 */
export async function endVoiceCheckin(guildId: string): Promise<string | null> {
  const session = activeSessions.get(guildId);
  if (!session) return null;

  // Remove from map first to prevent re-entry from disconnect events
  activeSessions.delete(guildId);

  const transcript = session.bridge.getTranscript();

  // Store transcript for /newproject command
  if (transcript) {
    guildTranscripts.set(guildId, transcript);
  }

  // Clean up voice resources
  session.bridge.disconnect();
  try {
    session.connection.destroy();
  } catch {
    // Already destroyed
  }

  // If we have both a transcript and a linked developer, save + process
  if (transcript && session.developerId) {
    try {
      // 1. Save check-in record
      const createRes = await fetch(`${session.appUrl}/api/checkins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          developerId: session.developerId,
          transcript,
          summary: `Discord voice check-in with ${session.developerName}`,
          mood: "neutral",
        }),
      });

      if (!createRes.ok) {
        throw new Error(`Failed to save check-in: ${createRes.status}`);
      }

      const checkIn = await createRes.json();
      const checkInId = checkIn.id;

      await session.textChannel.send(
        "Check-in saved! Processing transcript with AI..."
      );

      // 2. Trigger AI extraction via /api/checkins/process
      const processRes = await fetch(
        `${session.appUrl}/api/checkins/process`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkInId }),
        }
      );

      if (processRes.ok) {
        const result = await processRes.json();
        const extraction = result.extraction;

        // 3. Send formatted summary to text channel
        const embed = new EmbedBuilder()
          .setTitle(`Check-in Summary: ${session.developerName}`)
          .setColor(
            extraction.mood === "positive"
              ? 0x22c55e
              : extraction.mood === "frustrated" || extraction.mood === "blocked"
                ? 0xff0000
                : 0x3b82f6
          )
          .setDescription(extraction.summary)
          .setTimestamp();

        if (extraction.tasksWorkedOn.length > 0) {
          embed.addFields({
            name: "Tasks Worked On",
            value: extraction.tasksWorkedOn
              .map(
                (t: { taskName: string; progress: number }) =>
                  `• ${t.taskName} (${t.progress}%)`
              )
              .join("\n"),
          });
        }

        if (extraction.blockers.length > 0) {
          embed.addFields({
            name: "Blockers Reported",
            value: extraction.blockers
              .map(
                (b: { description: string; severity: string }) =>
                  `• [${b.severity.toUpperCase()}] ${b.description}`
              )
              .join("\n"),
          });
        }

        embed.addFields({
          name: "Mood",
          value: extraction.mood,
          inline: true,
        });

        await session.textChannel.send({ embeds: [embed] });

        if (extraction.blockers.length > 0) {
          await session.textChannel.send(
            "Blockers have been logged and will be routed to the right people."
          );
        }
      } else {
        await session.textChannel.send(
          "Check-in saved but AI processing failed. You can view the raw transcript in the web app."
        );
      }
    } catch (err) {
      console.error("Failed to save/process check-in:", err);
      await session.textChannel.send(
        "Check-in ended but failed to save transcript. Is the web app running?"
      );
    }
  } else if (transcript) {
    // No developer linked — show transcript in Discord
    await session.textChannel.send(
      `Check-in ended. Transcript:\n\`\`\`\n${transcript.slice(0, 1800)}\n\`\`\``
    );
  } else {
    await session.textChannel
      .send("Check-in ended. No conversation was recorded.")
      .catch(() => {});
  }

  return transcript;
}

/**
 * Check if a guild has an active session
 */
export function hasActiveSession(guildId: string): boolean {
  return activeSessions.has(guildId);
}
