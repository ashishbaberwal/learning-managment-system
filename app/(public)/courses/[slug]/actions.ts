"use server";

import { requireUser } from "@/app/data/user/require-user";
import arcjet, { fixedWindow } from "@/lib/arcjet";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { ApiResponse } from "@/lib/types";
import { request } from "@arcjet/next";
import { redirect } from "next/navigation";
import Stripe from "stripe";

const aj = arcjet.withRule(
    fixedWindow({
        mode: "LIVE",
        window: "1m",
        max: 5,
    })
);

export async function enrollInCourseAction(
    courseId: string
): Promise<ApiResponse | never> {
    const user = await requireUser();
    let checkoutUrl: string | null = null;
    try {
        const req = await request();
        const descision = await aj.protect(req, {
            fingerprint: user.id,
        });

        if (descision.isDenied()) {
            return {
                status: "error",
                message: "You Have been Blocked",
            };
        }
        const course = await prisma.course.findUnique({
            where: {
                id: courseId,
            },
            select: {
                id: true,
                title: true,
                price: true,
                slug: true,
                stripePriceId: true,
            },
        });

        if (!course) {
            return {
                status: "error",
                message: "Course Not found",
            };
        }

        let stripeCustomerId: string;

        const userWithStripeCustomerId = await prisma.user.findUnique({
            where: {
                id: user.id,
            },
            select: {
                stripeCustomerId: true,
            },
        });

        if (userWithStripeCustomerId?.stripeCustomerId) {
            stripeCustomerId = userWithStripeCustomerId.stripeCustomerId;
        } else {
            const customer = await stripe.customers.create({
                email: user.email,
                name: user.name,
                metadata: {
                    userId: user.id,
                },
            });

            stripeCustomerId = customer.id;

            await prisma.user.update({
                where: {
                    id: user.id,
                },
                data: {
                    stripeCustomerId: stripeCustomerId,
                },
            });
        }

        const existingEnrollment = await prisma.enrollment.findUnique({
            where: {
                userId_courseId: {
                    userId: user.id,
                    courseId: course.id,
                },
            },
            select: {
                status: true,
                id: true,
            },
        });

        if (existingEnrollment?.status === "Active") {
            return {
                status: "success",
                message: "Already enrolled in this course",
            };
        }

        const enrollment = await prisma.enrollment.upsert({
            where: {
                userId_courseId: {
                    userId: user.id,
                    courseId: course.id,
                },
            },
            create: {
                userId: user.id,
                courseId: course.id,
                amount: course.price * 100,
                status: "Pending",
            },
            update: {
                amount: course.price * 100,
                status: "Pending",
            },
            select: {
                id: true,
            },
        });

        const checkoutSession = await stripe.checkout.sessions.create({
            customer: stripeCustomerId,
            line_items: [
                {
                    price: course.stripePriceId,
                    quantity: 1,
                },
            ],
            mode: "payment",
            success_url: `${env.BETTER_AUTH_URL}/payment/success`,
            cancel_url: `${env.BETTER_AUTH_URL}/payment/cancel`,
            metadata: {
                userId: user.id,
                courseId: course.id,
                enrollmentId: enrollment.id,
            },
        });

        checkoutUrl = checkoutSession.url;
    } catch (error) {
        if (error instanceof Stripe.errors.StripeError) {
            return {
                status: "error",
                message: "Payment system error. Please try again later.",
            };
        }
        return {
            status: "error",
            message: "Failed To enroll In Course",
        };
    }

    if (!checkoutUrl) {
        return {
            status: "error",
            message: "Failed To enroll In Course",
        };
    }

    redirect(checkoutUrl);
}
