import { NextResponse } from 'next/server';

export function middleware(request) {
    const url = request.nextUrl.clone();

    // Check if the path starts with any of the blocked routes
    if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/ctrl-x7k9')) {
        // Redirect completely away from admin routes to the designated dashboard
        url.pathname = '/test/dashboard';
        return NextResponse.redirect(url);
    }

    // Block other test routes according to scope constraints
    if (url.pathname.startsWith('/demo') ||
        url.pathname.startsWith('/design') ||
        url.pathname.startsWith('/simulator') && url.pathname !== '/test/dashboard') {
        url.pathname = '/test/dashboard';
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
    matcher: ['/admin/:path*', '/ctrl-x7k9/:path*', '/demo/:path*', '/design/:path*', '/simulator/:path*'],
};
