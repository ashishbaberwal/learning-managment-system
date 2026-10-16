import { Prisma } from "@/lib/generated/prisma";
import { prisma } from "@/lib/db";
import { domainEvents, type DomainEventInput } from "@/lib/events";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { headers } from "next/headers";
import Stripe from "stripe";

export async function POST(req: Request) {
    const body = await req.text();
    const headersList = await headers();
    const signature = headersList.get("stripe-signature");

    if (!signature) {
        return new Response("Missing Stripe signature", { status: 400 });
    }

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            env.STRIPE_WEBHOOK_SECRET
        );
    } catch {
        return new Response("Webhook error", { status: 400 });
    }

    if (event.type !== "checkout.session.completed") {
        return new Response(null, { status: 200 });
    }

    const alreadyProcessed = await prisma.stripeWebhookEvent.findUnique({
        where: {
            eventId: event.id,
        },
        select: {
            id: true,
        },
    });

    if (alreadyProcessed) {
        return new Response(null, { status: 200 });
    }

    try {
        await processCheckoutCompleted(
            event,
            event.data.object as Stripe.Checkout.Session
        );
    } catch (error) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            return new Response(null, { status: 200 });
        }
        console.error("Stripe webhook processing failed:", event.id, error);
        return new Response("Webhook processing failed", { status: 500 });
    }

    return new Response(null, { status: 200 });
}

async function processCheckoutCompleted(
    event: Stripe.Event,
    session: Stripe.Checkout.Session
) {
    await prisma.$transaction(async (tx) => {
        await tx.stripeWebhookEvent.create({
            data: {
                eventId: event.id,
                eventType: event.type,
                payload: event as unknown as Prisma.InputJsonValue,
            },
        });

        const enrollmentId = session.metadata?.enrollmentId;
        const customerId = session.customer as string | null;

        if (!enrollmentId || !customerId) {
            console.error("Stripe webhook: missing session metadata", session.id);
            return;
        }

        const enrollment = await tx.enrollment.findUnique({
            where: {
                id: enrollmentId,
            },
            select: {
                id: true,
                userId: true,
                courseId: true,
                amount: true,
            },
        });

        if (!enrollment) {
            console.error("Stripe webhook: enrollment not found", enrollmentId);
            return;
        }

        const user = await tx.user.findUnique({
            where: {
                stripeCustomerId: customerId,
            },
            select: {
                id: true,
            },
        });

        if (!user || user.id !== enrollment.userId) {
            console.error(
                "Stripe webhook: customer does not own enrollment",
                enrollmentId
            );
            return;
        }

        if (session.payment_status !== "paid") {
            console.error("Stripe webhook: session not paid", session.id);
            return;
        }

        const amountTotal = session.amount_total ?? enrollment.amount;

        await tx.enrollment.update({
            where: {
                id: enrollment.id,
            },
            data: {
                status: "Active",
                amount: amountTotal,
            },
        });

        const events: DomainEventInput[] = [
            {
                eventType: "payment.succeeded",
                aggregateType: "enrollment",
                aggregateId: enrollment.id,
                partitionKey: enrollment.userId,
                payload: {
                    enrollmentId: enrollment.id,
                    userId: enrollment.userId,
                    courseId: enrollment.courseId,
                    amountTotal,
                    currency: session.currency ?? "usd",
                    stripeSessionId: session.id,
                },
            },
            {
                eventType: "course.enrolled",
                aggregateType: "enrollment",
                aggregateId: enrollment.id,
                partitionKey: enrollment.userId,
                payload: {
                    enrollmentId: enrollment.id,
                    userId: enrollment.userId,
                    courseId: enrollment.courseId,
                },
            },
        ];

        await tx.outboxEvent.createMany({
            data: domainEvents(events),
        });
    });
}
