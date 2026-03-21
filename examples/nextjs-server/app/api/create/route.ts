
import { createMatch } from "../../../lib/match-store";

const ENTRY_FEE = "10000000";

export async function POST(request: Request) {
  try {
    const { playerAddress, paymentBoc } = await request.json();

    if (!playerAddress || !paymentBoc) {
      return Response.json(
        { error: "playerAddress and paymentBoc are required" },
        { status: 400 }
      );
    }

    const match = createMatch(playerAddress, paymentBoc, ENTRY_FEE);

    return Response.json({
      matchId: match.id,
      seed: match.seed,
      entryFee: match.entryFee,
      status: match.status,
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}