import { handleApi } from "@/src/server/market-service";
export async function GET(request: Request) {
  return handleApi(request, {
    COINGLASS_SERVICE_URL: process.env.COINGLASS_SERVICE_URL,
    COINGLASS_TOKEN: process.env.COINGLASS_TOKEN,
    DATA_MODE: process.env.DATA_MODE,
    TWELVE_DATA_API_KEY: process.env.TWELVE_DATA_API_KEY,
  });
}
