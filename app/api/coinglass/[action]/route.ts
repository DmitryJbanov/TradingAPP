import { handleApi } from "@/src/server/market-service";
function handle(request: Request) {
  return handleApi(request, {
    DATA_MODE: process.env.DATA_MODE,
    COINGLASS_SERVICE_URL: process.env.COINGLASS_SERVICE_URL,
    COINGLASS_TOKEN: process.env.COINGLASS_TOKEN,
  });
}
export { handle as GET, handle as POST };
