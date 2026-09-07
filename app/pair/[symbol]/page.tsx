import Terminal from "@/src/components/terminal";
export default async function Pair({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  return <Terminal symbol={symbol} />;
}
