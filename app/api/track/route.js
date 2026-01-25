import { rtdb } from "@/lib/firebase";
import { ref, update, serverTimestamp } from "firebase/database";
import { NextResponse } from "next/server";

export async function POST(request) {
    try {
        let deviceId, restData;

        // Check Content-Type
        const contentType = request.headers.get("content-type") || "";

        if (contentType.includes("text/plain")) {
            // Handle CSV from ESP32
            const text = await request.text();
            const parts = text.split(',');
            if (parts.length >= 2) {
                deviceId = parts[0].trim();
                // Map CSV parts to fields (Adjust indices as needed based on ESP code)
                restData = {
                    lat: parts[1] || 0,
                    lng: parts[2] || 0,
                    status: parts[3] || "active",
                    raw: text
                };
            }
        } else {
            // Handle JSON (Default)
            const data = await request.json();
            const { deviceId: id, ...rest } = data;
            deviceId = id;
            restData = rest;
        }

        if (!deviceId) {
            return NextResponse.json(
                { error: "Missing deviceId or invalid CSV format" },
                { status: 400 }
            );
        }

        // Reference to the device in Realtime Database (devices/DEVICE_ID)
        // Also save to "logs" collection for History Page
        const deviceRef = ref(rtdb, `devices/${deviceId}`);

        // Update data (Upsert logic)
        await update(deviceRef, {
            deviceId,
            ...restData,
            lastUpdated: serverTimestamp(),
        });

        // Also save to Firestore Logs for History Page (Bridge Logic)
        // We import Firestore here dynamically to avoid cold start issues if possible, 
        // but typically standard import is fine.
        // We need 'db' from lib/firebase
        const { db } = await import("@/lib/firebase");
        const { doc, setDoc } = await import("firebase/firestore");

        const logId = `${deviceId}_${Date.now()}`;
        await setDoc(doc(db, "logs", logId), {
            ntfy_id: logId, // unique key
            device_id: deviceId,
            raw_content: restData.raw || JSON.stringify(restData),
            timestamp: new Date().toISOString(),
            source: 'vercel-direct'
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
