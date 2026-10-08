export function GET() { return Response.json({status:"ok",mediaConfigured:!!process.env.SCRAPECREATORS_API_KEY,mode:process.env.META_ACCESS_TOKEN?"live-api-configured":"awaiting-meta-connection"}); }
