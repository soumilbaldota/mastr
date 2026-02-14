import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

interface SeedData {
  organizations: { id: string; name: string }[];
  teams: {
    id: string;
    name: string;
    organizationId: string;
    discordChannel?: string | null;
  }[];
  developers: {
    id: string;
    name: string;
    email: string;
    role: string;
    teamId: string;
    discordUserId?: string | null;
  }[];
  projects: {
    id: string;
    name: string;
    description?: string | null;
    status?: string;
    startDate?: string;
    targetDate?: string | null;
  }[];
  tasks: {
    id: string;
    name: string;
    description?: string | null;
    projectId: string;
    assigneeId?: string | null;
    status?: string;
    duration?: number;
    progress?: number;
    priority?: string;
  }[];
  taskDependencies: { dependentId: string; dependencyId: string }[];
  blockers: {
    id?: string;
    taskId?: string | null;
    reportedById: string;
    assignedToId?: string | null;
    description: string;
    status?: string;
    priority?: string;
  }[];
  checkIns: {
    id?: string;
    developerId: string;
    date?: string;
    transcript?: string | null;
    summary?: string | null;
    mood?: string | null;
    items?: {
      type: string;
      content: string;
      taskId?: string | null;
      progress?: number | null;
    }[];
  }[];
}

async function main() {
  // Load seed data from JSON file
  const dataPath = join(__dirname, "seed-data.json");
  const data: SeedData = JSON.parse(readFileSync(dataPath, "utf-8"));

  // Clean existing data (order matters for foreign keys)
  await prisma.checkInItem.deleteMany();
  await prisma.checkIn.deleteMany();
  await prisma.blocker.deleteMany();
  await prisma.taskDependency.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.developer.deleteMany();
  await prisma.team.deleteMany();
  await prisma.organization.deleteMany();

  // Create organizations
  for (const org of data.organizations) {
    await prisma.organization.create({ data: org });
  }

  // Create teams
  for (const team of data.teams) {
    await prisma.team.create({
      data: {
        id: team.id,
        name: team.name,
        organizationId: team.organizationId,
        discordChannel: team.discordChannel ?? undefined,
      },
    });
  }

  // Create developers
  for (const dev of data.developers) {
    await prisma.developer.create({
      data: {
        id: dev.id,
        name: dev.name,
        email: dev.email,
        role: dev.role,
        teamId: dev.teamId,
        discordUserId: dev.discordUserId ?? undefined,
      },
    });
  }

  // Create projects
  for (const proj of data.projects) {
    await prisma.project.create({
      data: {
        id: proj.id,
        name: proj.name,
        description: proj.description ?? undefined,
        status: proj.status ?? "active",
        startDate: proj.startDate ? new Date(proj.startDate) : new Date(),
        targetDate: proj.targetDate ? new Date(proj.targetDate) : undefined,
      },
    });
  }

  // Create tasks
  for (const task of data.tasks) {
    await prisma.task.create({
      data: {
        id: task.id,
        name: task.name,
        description: task.description ?? undefined,
        projectId: task.projectId,
        assigneeId: task.assigneeId ?? undefined,
        status: task.status ?? "not_started",
        duration: task.duration ?? 1,
        progress: task.progress ?? 0,
        priority: task.priority ?? "medium",
      },
    });
  }

  // Create task dependencies
  for (const dep of data.taskDependencies) {
    await prisma.taskDependency.create({ data: dep });
  }

  // Create blockers
  for (const blocker of data.blockers) {
    await prisma.blocker.create({
      data: {
        id: blocker.id,
        taskId: blocker.taskId ?? undefined,
        reportedById: blocker.reportedById,
        assignedToId: blocker.assignedToId ?? undefined,
        description: blocker.description,
        status: blocker.status ?? "open",
        priority: blocker.priority ?? "high",
      },
    });
  }

  // Create check-ins with items
  for (const checkIn of data.checkIns) {
    await prisma.checkIn.create({
      data: {
        id: checkIn.id,
        developerId: checkIn.developerId,
        date: checkIn.date ? new Date(checkIn.date) : new Date(),
        transcript: checkIn.transcript ?? undefined,
        summary: checkIn.summary ?? undefined,
        mood: checkIn.mood ?? undefined,
        items: checkIn.items
          ? {
              create: checkIn.items.map((item) => ({
                type: item.type,
                content: item.content,
                taskId: item.taskId ?? undefined,
                progress: item.progress ?? undefined,
              })),
            }
          : undefined,
      },
    });
  }

  // Print summary
  console.log("Seed data loaded from seed-data.json!");
  console.log(`  - ${data.organizations.length} Organization(s)`);
  console.log(`  - ${data.teams.length} Team(s)`);
  console.log(`  - ${data.developers.length} Developer(s)`);
  console.log(`  - ${data.projects.length} Project(s)`);
  console.log(`  - ${data.tasks.length} Task(s) with ${data.taskDependencies.length} dependencies`);
  console.log(`  - ${data.blockers.length} Blocker(s)`);
  console.log(`  - ${data.checkIns.length} Check-in(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
