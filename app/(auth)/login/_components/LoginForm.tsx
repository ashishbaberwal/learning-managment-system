"use client";

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { Loader, GithubIcon, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function LoginForm() {

    const router = useRouter();

    const [githubPending, startGithubTransition] = useTransition();
    const [emailPending, startEmailTransition] = useTransition();
    const [email, setEmail] = useState("");

    async function signInWithGithub() {
        startGithubTransition(async () => {
            await authClient.signIn.social({
                provider: "github",
                callbackURL: "/",
                fetchOptions: {
                    onSuccess: () => {
                        toast.success(
                            "Signed in with Github, you will be redirected..."
                        );
                    },
                    onError: (error) => {
                        console.error("Github sign-in error:", error);
                        toast.error(
                            error?.error?.message ||
                                "Failed to sign in with Github. Please try again."
                        );
                    },
                },
            });
        });
    }

    function signInwithEmail() {
        startEmailTransition(async () => {
            await authClient.emailOtp.sendVerificationOtp({
                email: email,
                type:"sign-in",
                fetchOptions: {
                    onSuccess: () => {
                        toast.success("Email Sent");
                        router.push(`/verify-request?email=${email}`)
                    },
                    onError: () => {
                        toast.error('Error sending Email')
                    }
                }
            })
        })
    }


    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-xl">Welcome Back</CardTitle>
                <CardDescription>
                    Login With your github email Account
                </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
                <Button
                    className="w-full"
                    variant="outline"
                    onClick={signInWithGithub}
                    disabled={githubPending}
                >
                    {githubPending ? (
                        <>
                            <Loader className="size-4 animate-spin" />
                            <span>Loading...</span>
                        </>
                    ) : (
                        <>
                            <GithubIcon className="size-4" />
                            Sign In with Github
                        </>
                    )}
                </Button>

                <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border p-2">
                    <span className="relative z-10 bg-card px-2 text-muted-foreground">
                        Or continue with
                    </span>
                </div>

                <div className="grid gap-3">
                    <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input 
                            type="email" 
                            placeholder="m@exmaple.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required />
                    </div>

                    <Button onClick={signInwithEmail} disabled={emailPending}>
                        {emailPending ? (
                            <>
                            <Loader className="size-4 animate-spin"/>
                            <span>Loading...</span>
                            </>
                        ) : (
                            <>
                            <Send className="size-4"/>
                            <span>Continue with Email</span>
                            </>
                        )}   
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
