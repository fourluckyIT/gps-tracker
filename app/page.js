import { redirect } from 'next/navigation';

export default function HomeRedirect() {
    redirect('/v2/gate');
}
