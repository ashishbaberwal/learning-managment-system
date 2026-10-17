import { startDomainEventConsumer } from "../lib/consumer";
import { prisma } from "../lib/db";
import { registerKafkaConsumerLag, startMetricsServer } from "../lib/metrics";
import {
    applyRecommendationEvent,
    RECOMMENDATIONS_CONSUMER_GROUP,
} from "../lib/recommendations";

const METRICS_PORT = 9467;

startMetricsServer(METRICS_PORT);

registerKafkaConsumerLag(RECOMMENDATIONS_CONSUMER_GROUP).catch((error) => {
    console.error("Kafka lag metrics unavailable:", error);
});

startDomainEventConsumer({
    clientId: "lms-recommendations-consumer",
    groupId: RECOMMENDATIONS_CONSUMER_GROUP,
    handle: (envelope) => applyRecommendationEvent(envelope),
}).catch(async (error) => {
    console.error("Recommendations consumer failed to start:", error);
    await prisma.$disconnect();
    process.exit(1);
});
