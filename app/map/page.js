import { redirect } from 'next/navigation';

export default async function MapRedirect({ searchParams }) {
    // Await searchParams in Next.js >= 13.4 if needed, but in standard usage:
    const queryParams = await searchParams;
    const query = new URLSearchParams(queryParams || {}).toString();
    redirect(`/v2/map${query ? '?' + query : ''}`);
}
