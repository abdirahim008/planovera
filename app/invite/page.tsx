import InvitePage from "@/components/auth/InvitePage";

// Invite acceptance page (carries tokens) — keep out of search results.
export const metadata = { robots: { index: false, follow: false } };

export default function InviteRoutePage({
  searchParams,
}: {
  searchParams?: {
    token?: string;
    email?: string;
  };
}) {
  return <InvitePage token={searchParams?.token} email={searchParams?.email} />;
}
