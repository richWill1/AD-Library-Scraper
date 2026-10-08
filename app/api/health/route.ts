export function GET() { return Response.json({status:"ok",mode:process.env.META_ACCESS_TOKEN?"live-api-configured":"awaiting-meta-connection"}); }
