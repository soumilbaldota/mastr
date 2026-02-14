import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai/provider";

type DeveloperCandidate = { id: string; name: string };

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreNameMatch(candidateName: string, aliases: string[]): number {
  const normalizedCandidate = normalizeName(candidateName);
  let bestScore = 0;

  for (const alias of aliases) {
    const normalizedAlias = normalizeName(alias);
    if (!normalizedAlias) continue;

    if (normalizedCandidate === normalizedAlias) {
      bestScore = Math.max(bestScore, 3);
    } else if (
      normalizedCandidate.includes(normalizedAlias) ||
      normalizedAlias.includes(normalizedCandidate)
    ) {
      bestScore = Math.max(bestScore, 2);
    }
  }

  return bestScore;
}

async function aiMatchDeveloperId(
  aliases: string[],
  candidates: DeveloperCandidate[]
): Promise<string | null> {
  if (aliases.length === 0 || candidates.length === 0) return null;

  const roster = candidates
    .map((candidate) => `- ${candidate.id} | ${candidate.name}`)
    .join("\n");

  const schema = z.object({
    bestMatchId: z.string().nullable(),
  });

  const { object } = await generateObject({
    model: getModel(),
    schema,
    system:
      "Pick the best matching developer from a list based on the target name(s). Return null if no good match.",
    prompt: `Target names: ${aliases.join(", ")}\nDevelopers:\n${roster}\nReturn bestMatchId only.`,
  });

  if (!object.bestMatchId) return null;

  return candidates.some((candidate) => candidate.id === object.bestMatchId)
    ? object.bestMatchId
    : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const discordUserId = searchParams.get("discordUserId");
  const name = searchParams.get("name") || "";
  const username = searchParams.get("username") || "";
  const aliases = [name, username].map((value) => value.trim()).filter(Boolean);

  if (!discordUserId && aliases.length === 0) {
    return NextResponse.json(
      { error: "discordUserId or name query parameter is required" },
      { status: 400 }
    );
  }

  const includeContext = {
    team: {
      include: { organization: true },
    },
    assignedTasks: {
      include: {
        project: true,
        blockers: { where: { status: "open" } },
      },
    },
    checkIns: {
      orderBy: { date: "desc" as const },
      take: 3,
      select: {
        id: true,
        date: true,
        summary: true,
        mood: true,
      },
    },
  };

  let developer = discordUserId
    ? await prisma.developer.findFirst({
        where: { discordUserId },
        include: includeContext,
      })
    : null;

  if (!developer && aliases.length > 0) {
    const candidates = await prisma.developer.findMany({
      select: { id: true, name: true },
    });

    let bestCandidate: DeveloperCandidate | null = null;
    let bestScore = 0;
    for (const candidate of candidates) {
      const score = scoreNameMatch(candidate.name, aliases);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    let matchedId = bestScore > 0 ? bestCandidate?.id ?? null : null;

    if (!matchedId) {
      try {
        matchedId = await aiMatchDeveloperId(aliases, candidates);
      } catch (err) {
        console.warn("[DeveloperLookup] AI match failed:", err);
      }
    }

    if (matchedId) {
      developer = await prisma.developer.findUnique({
        where: { id: matchedId },
        include: includeContext,
      });

      if (developer && discordUserId && !developer.discordUserId) {
        developer = await prisma.developer.update({
          where: { id: developer.id },
          data: { discordUserId },
          include: includeContext,
        });
      }
    }
  }

  if (!developer) {
    return NextResponse.json(
      { error: "No developer found for this Discord account" },
      { status: 404 }
    );
  }

  return NextResponse.json(developer);
}
