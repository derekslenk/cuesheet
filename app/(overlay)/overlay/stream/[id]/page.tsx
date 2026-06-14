import StreamLabel from './StreamLabel';

// force-dynamic: the label reflects the live DB row; never prerender/cache it.
export const dynamic = 'force-dynamic';

export default async function OverlayStreamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StreamLabel id={id} />;
}
