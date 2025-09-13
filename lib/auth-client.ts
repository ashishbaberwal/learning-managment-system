import { createAuthClient } from "better-auth/react"
import { emailOTPClient } from "better-auth/client/plugins"
import { adminClient } from "better-auth/client/plugins"


export const authClient = createAuthClient({
    /** The base URL of the server (optional if you're using the same domain) */
    // baseURL: "http://localhost:3000"
    // we use nextjs so we dont need baseurl
    plugins:[emailOTPClient(), adminClient()]
})