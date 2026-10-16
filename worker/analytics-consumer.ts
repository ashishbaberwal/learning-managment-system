import {
    ANALYTICS_CONSUMER_GROUP,
    applyDomainEvent,
} from "../lib/analytics";
import { startDomainEventConsumer } from "../lib/consumer";
import { prisma } from "../lib/db";

startDomainEventConsumer({
    clientId: "lms-analytics-consumer",
    groupId: ANALYTICS_CONSUMER_GROUP,
    handle: (envelope) => applyDomainEvent(envelope),
}).catch(async (error) => {
    console.error("Analytics consumer failed to start:", error);
    await prisma.$disconnect();
    process.exit(1);
});
