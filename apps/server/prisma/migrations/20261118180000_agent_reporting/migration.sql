CREATE TABLE "AgentRunState" (
    "agentId" TEXT NOT NULL PRIMARY KEY,
    "trackedSince" DATETIME NOT NULL,
    "lastEventAt" DATETIME NOT NULL,
    "lastEventKind" TEXT NOT NULL,
    "working" BOOLEAN NOT NULL,
    "lastObservedAt" DATETIME NOT NULL,
    "intervalId" TEXT,
    CONSTRAINT "AgentRunState_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AgentWorkingInterval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentWorkingInterval_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AgentWorkingInterval_agentId_startedAt_idx" ON "AgentWorkingInterval"("agentId", "startedAt");

CREATE TABLE "AgentRuntimeDay" (
    "agentId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    PRIMARY KEY ("agentId", "date"),
    CONSTRAINT "AgentRuntimeDay_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
