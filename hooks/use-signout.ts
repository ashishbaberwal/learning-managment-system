"use client"

import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function useSignOut() {

    const router = useRouter()
    const handelSignOut = async function signOut() {
        await authClient.signOut({
            fetchOptions: {
                onSuccess: () => {
                    router.push("/"); // redirect to login page
                    toast.success("SignOut Successfully");
                },
                onError: () => {
                    toast.error("failed to SignOut");
                },
            },
        });
    }
    return handelSignOut;
}