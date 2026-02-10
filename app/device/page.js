'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function DeviceRedirect() {
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        const id = searchParams.get('id');
        if (id) {
            router.replace(`/map?id=${encodeURIComponent(id)}`);
        } else {
            router.replace('/');
        }
    }, [router, searchParams]);

    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a0a0a',
            color: '#888',
            fontFamily: 'sans-serif'
        }}>
            <p>Redirecting to map...</p>
        </div>
    );
}
