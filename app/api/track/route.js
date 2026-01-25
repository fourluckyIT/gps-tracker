import { rtdb } from "@/lib/firebase";
import { ref, update, serverTimestamp } from "firebase/database";
import { NextResponse } from "next/server";

export async function POST(request) {
    try {
        const data = await request.json();
        const { deviceId, ...rest } = data;

        if (!deviceId) {
            return NextResponse.json(
                { error: "Missing deviceId" },
                { status: 400 }
            );
        }

        // Reference to the device in Realtime Database (devices/DEVICE_ID)
        const deviceRef = ref(rtdb, `devices/${deviceId}`);

        // Update data (Upsert logic)
        await update(deviceRef, {
            deviceId,
            ...rest,
            lastUpdated: serverTimestamp(), // RTDB uses a different timestamp mechanism but this SDK handles it
        });

        return NextResponse.json({ success: true, message: "Data received" });
    } catch (error) {
        console.error("Error writing to RTDB:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
