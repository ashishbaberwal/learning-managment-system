import { registry } from "@/lib/metrics";

export const runtime = "nodejs";

export async function GET() {
    return new Response(await registry.metrics(), {
        headers: {
            "Content-Type": registry.contentType,
        },
    });
}
