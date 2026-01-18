/* eslint-disable @typescript-eslint/no-unused-vars */


import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";
import { env } from "./env";
import { emailOTP } from "better-auth/plugins"
import { resend } from "./resend";
import { admin } from "better-auth/plugins"


export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql", // or "mysql", "postgresql", ...etc
    }),

    socialProviders: {
        github: {
            clientId: env.AUTH_GITHUB_CLIENT_ID,
            clientSecret: env.AUTH_GITHUB_SECRET,
        },

    },

    plugins: [
        emailOTP({
            async sendVerificationOTP({ email, otp }) {
                //implement sending the email to user
                const { data, error } = await resend.emails.send({
                    from: 'BaberwalLMS <onboarding@resend.dev>',
                    to: [email],
                    subject: 'BaberwalLMS - Verify Your Email',
                    html: `<p> Your Otp is <strong>${otp}</strong> </p>`,
                });
            },
        }),
        admin(),
    ],
});