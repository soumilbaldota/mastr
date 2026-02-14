import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
  MessageFlags,
} from "discord.js";
import "dotenv/config";
import { LLMClient } from "./voice/llm";
import {
  startVoiceCheckin,
  endVoiceCheckin,
  hasActiveSession,
  registerVoiceStateHandler,
  getLastTranscript,
} from "./voice/handler";
import type { DeveloperContext } from "./voice/prompts";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// ---------- Slash Command Definitions ----------

const commands = [
  new SlashCommandBuilder()
    .setName("checkin")
    .setDescription(
      "Start your daily voice check-in with Mastr AI (join a voice channel first!)"
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("endcheckin")
    .setDescription("End your current voice check-in session")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Get current project status")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("blockers")
    .setDescription("View current blockers across all projects")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("standup")
    .setDescription(
      "Create a voice channel for daily standup and join it for a check-in"
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("newproject")
    .setDescription(
      "Create a new project from the last standup/check-in transcript"
    )
    .toJSON(),
];

// ---------- Register Commands ----------

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(
    process.env.DISCORD_BOT_TOKEN!
  );

  try {
    console.log("Registering slash commands...");
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.DISCORD_CLIENT_ID!,
        process.env.DISCORD_GUILD_ID!
      ),
      { body: commands }
    );
    console.log("Slash commands registered: /checkin, /endcheckin, /status, /blockers, /standup, /newproject");
  } catch (error) {
    console.error("Failed to register commands:", error);
  }
}

// ---------- Bot Client ----------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
});

let matcherLLM: LLMClient | null = null;

function getMatcherLLM(): LLMClient | null {
  if (matcherLLM) return matcherLLM;
  try {
    matcherLLM = new LLMClient({});
    return matcherLLM;
  } catch (err) {
    console.warn("[Matcher] LLM unavailable:", err);
    return null;
  }
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function candidateNames(candidate: {
  displayName: string;
  username: string;
  globalName?: string | null;
}): string[] {
  return [candidate.displayName, candidate.username, candidate.globalName || ""]
    .map((name) => name.trim())
    .filter(Boolean);
}

async function resolveUserIdFromName(targetName: string): Promise<string | null> {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return null;

  const guild = await client.guilds.fetch(guildId);
  const members = await guild.members.fetch();

  const candidates = members.map((member) => ({
    id: member.user.id,
    displayName: member.displayName,
    username: member.user.username,
    globalName: member.user.globalName,
  }));

  const normalizedTarget = normalizeName(targetName);

  for (const candidate of candidates) {
    if (
      candidateNames(candidate).some(
        (name) => normalizeName(name) === normalizedTarget
      )
    ) {
      return candidate.id;
    }
  }

  const shortlist = candidates.filter((candidate) =>
    candidateNames(candidate).some((name) => {
      const normalized = normalizeName(name);
      return (
        normalized.includes(normalizedTarget) ||
        normalizedTarget.includes(normalized)
      );
    })
  );

  const pool = shortlist.length > 0 ? shortlist : candidates.slice(0, 200);
  const llm = getMatcherLLM();
  if (!llm) return null;

  const roster = pool
    .map((candidate) => {
      const names = candidateNames(candidate).join(" | ");
      return `- ${candidate.id} | ${names}`;
    })
    .join("\n");

  const response = await llm.chat(
    "You match a target person name to a Discord user from a list. Return ONLY the userId from the list. If no good match, return an empty string.",
    [
      {
        role: "user",
        content: `Target name: ${targetName}\nUsers:\n${roster}\nReturn userId only.`,
      },
    ],
    80
  );

  const candidateId = response.trim().split(/\s+/)[0];
  return pool.some((candidate) => candidate.id === candidateId)
    ? candidateId
    : null;
}

client.once("clientReady", () => {
  console.log(`Mastr Bot logged in as ${client.user?.tag}`);
  registerCommands();

  // Listen for users leaving voice channels to auto-end check-ins
  registerVoiceStateHandler(client);

  // Start polling for blocker notifications from the web app
  setInterval(pollNotifications, 10_000);
});

// ---------- Command Handlers ----------

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    switch (interaction.commandName) {
      case "checkin":
        await handleCheckin(interaction);
        break;
      case "endcheckin":
        await handleEndCheckin(interaction);
        break;
      case "status":
        await handleStatus(interaction);
        break;
      case "blockers":
        await handleBlockers(interaction);
        break;
      case "standup":
        await handleStandup(interaction);
        break;
      case "newproject":
        await handleNewProject(interaction);
        break;
    }
  } catch (error) {
    console.error(`Error handling /${interaction.commandName}:`, error);
    const msg = "Something went wrong. Please try again.";
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(msg);
    } else {
      await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    }
  }
});

// ---- /checkin: Join voice channel and start AI check-in ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCheckin(interaction: any) {
  const member = interaction.member;
  const voiceChannel = member?.voice?.channel;

  if (!voiceChannel) {
    await interaction.reply({
      content:
        "You need to be in a voice channel first! Join one, then use `/checkin`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (hasActiveSession(interaction.guild!.id)) {
    await interaction.reply({
      content:
        "A check-in is already in progress. Use `/endcheckin` to stop it first.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Look up the developer by their Discord user ID
  let developerId: string | undefined;
  let developerContext: DeveloperContext | undefined;

  try {
    const lookupRes = await fetch(
      `${APP_URL}/api/developers/lookup?discordUserId=${member.user.id}&name=${encodeURIComponent(member.displayName)}&username=${encodeURIComponent(member.user.username)}`
    );

    if (lookupRes.ok) {
      const devData = await lookupRes.json();
      developerId = devData.id;
      console.log(`[Checkin] Linked Discord user to developer: ${devData.name} (${developerId})`);

      // Fetch full context for contextual prompt
      const contextRes = await fetch(
        `${APP_URL}/api/checkins/context?developerId=${developerId}`
      );
      if (contextRes.ok) {
        developerContext = await contextRes.json();
        console.log(
          `[Checkin] Loaded context: ${developerContext!.assignedTasks.length} tasks, ${developerContext!.openBlockers.length} blockers`
        );
      }
    } else {
      console.log(
        `[Checkin] No developer linked for Discord user ${member.user.id}`
      );
    }
  } catch (err) {
    console.error("[Checkin] Developer lookup failed:", err);
  }

  const embedDesc = developerId
    ? `Joining **${voiceChannel.name}**... The AI agent will start a personalized check-in with you.`
    : `Joining **${voiceChannel.name}**... The AI agent will start talking to you about your progress and blockers.\n\n*Your Discord account isn't linked to a developer profile yet. Check-in won't be saved. Ask your admin to set your Discord ID in the Mastr web app.*`;

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("Starting Voice Check-in")
        .setDescription(embedDesc)
        .setColor(developerId ? 0x3b82f6 : 0xffd700)
        .setFooter({ text: "Use /endcheckin when you're done" }),
    ],
  });

  await startVoiceCheckin({
    voiceChannel,
    guild: interaction.guild!,
    member,
    textChannel: interaction.channel,
    appUrl: APP_URL,
    developerId,
    developerContext,
  });
}

// ---- /endcheckin: Stop the current session ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleEndCheckin(interaction: any) {
  if (!hasActiveSession(interaction.guild!.id)) {
    await interaction.reply({
      content: "No active check-in session to end.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply("Ending check-in session...");
  await endVoiceCheckin(interaction.guild!.id);
}

// ---- /status: Show project status ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleStatus(interaction: any) {
  await interaction.deferReply();

  try {
    const res = await fetch(`${APP_URL}/api/projects`);
    const projects = await res.json();

    if (projects.length === 0) {
      await interaction.editReply("No projects found.");
      return;
    }

    const embeds = projects.slice(0, 3).map(
      (project: {
        name: string;
        description: string;
        tasks: { status: string }[];
      }) => {
        const total = project.tasks.length;
        const completed = project.tasks.filter(
          (t) => t.status === "completed"
        ).length;
        const inProgress = project.tasks.filter(
          (t) => t.status === "in_progress"
        ).length;
        const blocked = project.tasks.filter(
          (t) => t.status === "blocked"
        ).length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        const bar =
          "\u2588".repeat(Math.floor(pct / 10)) +
          "\u2591".repeat(10 - Math.floor(pct / 10));

        return new EmbedBuilder()
          .setTitle(project.name)
          .setDescription(project.description || "No description")
          .setColor(
            blocked > 0 ? 0xff0000 : pct === 100 ? 0x22c55e : 0x3b82f6
          )
          .addFields(
            { name: "Progress", value: `${bar} ${pct}%`, inline: false },
            {
              name: "Tasks",
              value: `${completed}/${total} done`,
              inline: true,
            },
            { name: "In Progress", value: `${inProgress}`, inline: true },
            { name: "Blocked", value: `${blocked}`, inline: true }
          )
          .setFooter({ text: `Details: ${APP_URL}/projects` });
      }
    );

    await interaction.editReply({ embeds });
  } catch {
    await interaction.editReply(
      "Failed to fetch project status. Is the Mastr web app running?"
    );
  }
}

// ---- /blockers: Show active blockers ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleBlockers(interaction: any) {
  await interaction.deferReply();

  try {
    const res = await fetch(`${APP_URL}/api/blockers`);
    const blockers = await res.json();

    if (blockers.length === 0) {
      await interaction.editReply(
        "No active blockers! Everything is flowing smoothly."
      );
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`Active Blockers (${blockers.length})`)
      .setColor(0xff0000)
      .setDescription(
        blockers
          .slice(0, 10)
          .map(
            (
              b: {
                priority: string;
                description: string;
                reportedBy: { name: string };
                task: { name: string };
              },
              i: number
            ) => {
              const emoji =
                b.priority === "critical"
                  ? "\uD83D\uDD34"
                  : b.priority === "high"
                    ? "\uD83D\uDFE0"
                    : "\uD83D\uDFE1";
              return `${emoji} **${i + 1}.** ${b.description}\n   Task: ${b.task?.name || "N/A"} | By: ${b.reportedBy?.name || "Unknown"}`;
            }
          )
          .join("\n\n")
      )
      .setFooter({ text: `View all: ${APP_URL}/blockers` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch {
    await interaction.editReply("Failed to fetch blockers.");
  }
}

// ---- /standup: Create voice channel + start check-in ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleStandup(interaction: any) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply("This command can only be used in a server.");
    return;
  }

  try {
    const channelName = `standup-${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

    const voiceChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      reason: "Daily standup meeting created by Mastr",
    });

    const embed = new EmbedBuilder()
      .setTitle("Daily Standup Meeting")
      .setDescription(
        `Voice channel created! Join it and then run \`/checkin\` to start your AI-powered standup.\n\nThe agent will ask about your progress, blockers, and how it can help.`
      )
      .setColor(0x22c55e)
      .addFields(
        { name: "Voice Channel", value: `<#${voiceChannel.id}>`, inline: true },
        {
          name: "How to use",
          value:
            "1. Join the voice channel\n2. Run `/checkin`\n3. Talk to the AI agent\n4. Run `/endcheckin` when done",
          inline: false,
        }
      )
      .setFooter({ text: "Mastr - AI-First Project Management" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    // Auto-delete the voice channel after 1 hour
    setTimeout(async () => {
      try {
        await voiceChannel.delete("Standup meeting ended");
      } catch {
        // Already deleted
      }
    }, 60 * 60 * 1000);
  } catch {
    await interaction.reply(
      "Failed to create standup channel. Make sure I have Manage Channels permission."
    );
  }
}

// ---- /newproject: Create project from last standup transcript ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleNewProject(interaction: any) {
  const guildId = interaction.guild?.id;
  if (!guildId) {
    await interaction.reply("This command can only be used in a server.");
    return;
  }

  const transcript = getLastTranscript(guildId);
  if (!transcript) {
    await interaction.reply({
      content:
        "No recent check-in transcript found. Run `/checkin` first, have a standup conversation, then use `/newproject`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  try {
    const res = await fetch(`${APP_URL}/api/projects/from-scrum`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript,
        participants: [], // Could be enhanced to track participants per session
      }),
    });

    if (!res.ok) {
      await interaction.editReply(
        "Failed to analyze transcript. Is the web app running?"
      );
      return;
    }

    const result = await res.json();

    if (!result.shouldCreateProject) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("No New Project Detected")
            .setDescription(
              "The AI analyzed the last standup transcript but didn't find a clear new project or initiative being discussed. If you want to create a project manually, use the web app."
            )
            .setColor(0xffd700)
            .setFooter({ text: `${APP_URL}/projects` }),
        ],
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`New Project Created: ${result.project.name}`)
      .setDescription(result.project.description || "No description")
      .setColor(0x22c55e)
      .addFields(
        {
          name: "Tasks Created",
          value: `${result.taskCount} task(s)`,
          inline: true,
        },
        {
          name: "Target Date",
          value: result.project.targetDate
            ? new Date(result.project.targetDate).toLocaleDateString()
            : "Not set",
          inline: true,
        }
      )
      .setFooter({ text: `View: ${APP_URL}/projects` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("[NewProject] Failed:", err);
    await interaction.editReply(
      "Failed to create project from transcript. Check the bot logs."
    );
  }
}

// ---------- Notification Polling ----------

async function pollNotifications() {
  try {
    const res = await fetch(`${APP_URL}/api/discord/notify`);
    const notifications = await res.json();

    for (const notification of notifications) {
      try {
        if (notification.channelId) {
          const channel = await client.channels.fetch(notification.channelId);
          if (channel && channel.isTextBased() && "send" in channel) {
            const embed = new EmbedBuilder()
              .setTitle(notification.embed.title)
              .setDescription(notification.embed.description)
              .setColor(notification.embed.color);
            if (notification.embed.fields)
              embed.addFields(notification.embed.fields);
            if (notification.embed.footer)
              embed.setFooter(notification.embed.footer);
            await channel.send({ embeds: [embed] });
          }
        }
        if (notification.userId) {
          const user = await client.users.fetch(notification.userId);
          if (user) {
            const embed = new EmbedBuilder()
              .setTitle(notification.embed.title)
              .setDescription(notification.embed.description)
              .setColor(notification.embed.color);
            if (notification.embed.fields)
              embed.addFields(notification.embed.fields);
            await user.send({ embeds: [embed] });
          }
        } else if (notification.targetPersonName) {
          const resolvedUserId = await resolveUserIdFromName(
            notification.targetPersonName
          );
          if (resolvedUserId) {
            const user = await client.users.fetch(resolvedUserId);
            if (user) {
              const embed = new EmbedBuilder()
                .setTitle(notification.embed.title)
                .setDescription(notification.embed.description)
                .setColor(notification.embed.color);
              if (notification.embed.fields)
                embed.addFields(notification.embed.fields);
              await user.send({ embeds: [embed] });
            }
          } else {
            console.warn(
              "[Notify] No Discord user match for",
              notification.targetPersonName
            );
          }
        }
      } catch (err) {
        console.error("Failed to send notification:", err);
      }
    }
  } catch {
    // Web app might not be running
  }
}

// ---------- Start Bot ----------

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error("DISCORD_BOT_TOKEN is not set in .env");
  process.exit(1);
}

console.log("Starting Mastr Discord Bot...");
client.login(token);
