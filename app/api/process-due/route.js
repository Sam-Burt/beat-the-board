import { NextResponse } from "next/server";
import { supabaseAdmin, getAuthedUser } from "../../../lib/supabaseAdmin";
import { processDueMissions } from "../../../lib/processDue";

// The opportunistic path: any signed-in player's device calls this on load
// (see lib/useBoardData.js), which is how scheduled missions used to get
// sent at all. app/api/cron now does the same job on a real schedule, so
// this is just a backstop for if that ever stops running — whichever gets
// there first sends the mission, and the other finds nothing to do.
export async function POST(request) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server isn't configured with SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  const callerId = await getAuthedUser(request);
  if (!callerId) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const result = await processDueMissions();
  return NextResponse.json(result);
}
