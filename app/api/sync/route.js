import { NextResponse } from 'next/server';
import { db } from '../../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

// Force dynamic requirement for Vercel Cron behavior
export const dynamic = 'force-dynamic';

const TOPIC_NAME = "gps-tracker-hub-8376c";

export async function GET() {
    try {
        console.log("Cron Sync Started...");

        // 1. Fetch from Ntfy (Last 15 minutes to be safe)
        // "since=15m" covers the 10-minute cron interval + buffer
        const response = await fetch(`https://ntfy.sh/${TOPIC_NAME}/json?poll=1&since=15m`);
        const text = await response.text();

        // Ntfy returns NDJSON (Newline Delimited JSON)
        const lines = text.trim().split('\n');
        let count = 0;

        for (const line of lines) {
            if (!line) continue;

            try {
                const data = JSON.parse(line);
                if (data.event === 'message' && data.message) {

                    // Extract CSV Data
                    const parts = data.message.split(',');
                    if (parts.length >= 1) {
                        const id = parts[0]?.trim();
                        const content = parts.slice(1).join(', ');
                        const timestamp = new Date(data.time * 1000).toISOString();

                        // Save to Firestore (Idempotent: uses Ntfy ID as key)
                        await setDoc(doc(db, "logs", data.id), {
                            ntfy_id: data.id,
                            device_id: id,
                            raw_content: content,
                            timestamp: timestamp,
                            synced_at: new Date().toISOString(),
                            source: 'vercel-cron'
                        });
                        count++;
                    }
                }
            } catch (parseErr) {
                console.error("Parse Error:", parseErr);
            }
        }

        return NextResponse.json({ success: true, synced: count });
    } catch (error) {
        console.error("Sync Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
