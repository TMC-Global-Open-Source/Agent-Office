import { PrismaClient } from "@prisma/client";
import { MockAgentProvider } from "../src/providers/mock.js";
import { randomAvatarColor } from "../src/avatar-color.js";

const prisma = new PrismaClient();
const provider = new MockAgentProvider();

for (const [index, agent] of (await provider.fetchAgents()).entries()) {
  await prisma.agent.upsert({
    where: { id: agent.id },
    create: {
      id: agent.id,
      displayName: agent.displayName,
      source: agent.source,
      repositoryOwner: agent.repositoryOwner,
      repositoryName: agent.repositoryName,
      issueNumber: agent.issueNumber,
      taskTitle: agent.taskTitle,
      status: agent.status,
      statusReason: agent.statusReason,
      statusConfidence: 1,
      statusKind: "mock",
      tokensUsed: agent.tokensUsed,
      metadata: JSON.stringify({ ...agent.metadata, statusEvidence: agent.statusEvidence }),
      desk: { create: { id: `desk-${agent.id}`, row: Math.floor(index / 5), column: index % 5 } },
      avatar: { create: { color: randomAvatarColor(), seed: index } },
    },
    update: {},
  });
}
await prisma.$disconnect();
