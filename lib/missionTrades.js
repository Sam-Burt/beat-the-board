import { supabaseAdmin } from "./supabaseAdmin";

// A mission tied up in a pending trade proposal (offered by its owner, or
// requested by someone else) can't be completed, declined, or offered into
// a second trade until that proposal resolves — otherwise a swap could try
// to move a mission that's already been proved or given away. Shared by
// upload-proof, decline, and propose-trade so all three agree on what
// counts as "locked."
export async function hasPendingTrade(missionId) {
  const { data } = await supabaseAdmin
    .from("mission_trades")
    .select("id")
    .eq("status", "pending")
    .or(`proposer_mission_id.eq.${missionId},recipient_mission_id.eq.${missionId}`)
    .limit(1);
  return !!data?.length;
}
