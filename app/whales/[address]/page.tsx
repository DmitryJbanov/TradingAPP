import { WhalesPage } from "@/src/components/whales-page";
export default async function Profile({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  return <WhalesPage address={address.toLowerCase()} />;
}
