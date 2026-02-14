/**
 * Discord notification utilities
 * Sends blocker notifications and messages to Discord channels/users
 */

interface DiscordNotification {
  channelId?: string;
  userId?: string;
  targetPersonName?: string;
  embed: {
    title: string;
    description: string;
    color: number;
    fields?: { name: string; value: string; inline?: boolean }[];
    footer?: { text: string };
  };
}

const COLORS = {
  critical: 0xff0000, // Red
  high: 0xff8c00, // Orange
  medium: 0xffd700, // Yellow
  resolved: 0x00ff00, // Green
  info: 0x0099ff, // Blue
};

/**
 * Send a blocker notification to Discord via the bot API
 */
export async function sendBlockerNotification(params: {
  blockerDescription: string;
  reportedBy: string;
  taskName: string;
  priority: "medium" | "high" | "critical";
  targetDiscordUserId?: string;
  targetPersonName?: string;
  targetChannelId?: string;
  appUrl: string;
}): Promise<void> {
  const notification: DiscordNotification = {
    channelId: params.targetChannelId,
    userId: params.targetDiscordUserId,
    targetPersonName: params.targetPersonName,
    embed: {
      title: `🚨 Blocker: ${params.taskName}`,
      description: params.blockerDescription,
      color: COLORS[params.priority],
      fields: [
        { name: "Reported By", value: params.reportedBy, inline: true },
        { name: "Priority", value: params.priority.toUpperCase(), inline: true },
        { name: "Task", value: params.taskName, inline: true },
      ],
      footer: {
        text: `View in Mastr: ${params.appUrl}/blockers`,
      },
    },
  };

  // Send via our internal API that the Discord bot listens to
  await fetch(`${params.appUrl}/api/discord/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(notification),
  });
}

/**
 * Send a project status update to a Discord channel
 */
export async function sendProjectUpdate(params: {
  channelId: string;
  projectName: string;
  completion: number;
  criticalPathDays: number;
  activeBlockers: number;
  appUrl: string;
}): Promise<void> {
  const healthColor =
    params.activeBlockers > 2
      ? COLORS.critical
      : params.completion < 30
        ? COLORS.medium
        : COLORS.info;

  const notification: DiscordNotification = {
    channelId: params.channelId,
    embed: {
      title: `📊 Project Update: ${params.projectName}`,
      description: `Progress: ${params.completion}% complete`,
      color: healthColor,
      fields: [
        {
          name: "Critical Path",
          value: `${params.criticalPathDays} days remaining`,
          inline: true,
        },
        {
          name: "Active Blockers",
          value: `${params.activeBlockers}`,
          inline: true,
        },
        {
          name: "Completion",
          value: `${"█".repeat(Math.floor(params.completion / 10))}${"░".repeat(10 - Math.floor(params.completion / 10))} ${params.completion}%`,
          inline: false,
        },
      ],
      footer: {
        text: `View details: ${params.appUrl}/projects`,
      },
    },
  };

  await fetch(`${params.appUrl}/api/discord/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(notification),
  });
}

/**
 * Format a message for Discord delivery
 */
export function formatBlockerMessage(params: {
  blockerDescription: string;
  reportedBy: string;
  taskName: string;
  priority: string;
}): string {
  const emoji =
    params.priority === "critical"
      ? "🔴"
      : params.priority === "high"
        ? "🟠"
        : "🟡";
  return `${emoji} **Blocker Alert** - ${params.taskName}\n> ${params.blockerDescription}\n*Reported by ${params.reportedBy}* | Priority: **${params.priority.toUpperCase()}**`;
}
