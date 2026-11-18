import {NextRequest, NextResponse} from 'next/server';
// /seasonal opens whichever tracker is in season: Black Friday until Cyber
// Monday, otherwise Christmas. Each event page has tabs to switch between them.
export function GET(req: NextRequest) {
  const now = new Date(), y = now.getUTCFullYear();
  const nov1 = new Date(Date.UTC(y, 10, 1)), firstThu = 1 + ((4 - nov1.getUTCDay() + 7) % 7);
  const cyberMonday = new Date(Date.UTC(y, 10, firstThu + 21 + 4, 23, 59));
  const event = now >= new Date(Date.UTC(y, 9, 15)) && now <= cyberMonday ? 'black-friday-ads' : 'christmas-ads';
  return NextResponse.redirect(new URL('/' + event, req.nextUrl.origin), 307);
}
