import { startDomainEventConsumer } from "../lib/consumer";
import { prisma } from "../lib/db";
import {
    applyRecommendationEvent,
    RECOMMENDATIONS_CONSUMER_GROUP,
} from "../lib/recommendations";

startDomainEventConsumer({
    clientId: "lms-recommendations-consumer",
    groupId: RECOMMENDATIONS_CONSUMER_GROUP,
    handle: (envelope) => applyRecommendationEvent(envelope),
}).catch(async (error) => {
    console.error("Recommendations consumer failed to start:", error);
    await prisma.$disconnect();
    process.exit(1);
});
