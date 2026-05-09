import InvitePage from "@/components/auth/InvitePage";

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
