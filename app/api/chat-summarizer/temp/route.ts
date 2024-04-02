import { NextRequest, NextResponse } from "next/server";

import { getAIResponse } from "@/services/getAIResponse";

const SAMPLE_INPUT = `Alyssa_DeMetro — 10/03/2022 02:13 I had trouble logging into it but will touch base with them to update it Shubham Prakash — 10/03/2022 02:14 YOu can ask the okta credential from micheal and use it in cypress.env.json YOu'll also need to create a local sql database and update this env- DATABASE_URL=mysql://root:mysql@2308@localhost:3306/naf Alyssa_DeMetro — 10/03/2022 02:15 It's actually working now! okk Thanks Shubham I really appreciate it 👍 Shubham Prakash — 10/03/2022 02:16 You're welcome.  🙂 Alyssa_DeMetro — 10/03/2022 03:04 Will I need to update the values of OKTA_CLIENT_ID, OKTA_CLIENT_SECRET, OKTA_DOMAIN according to my account or no? I can't seem to log in so unsure Shubham Prakash — 10/03/2022 03:05 Is your account managed by NAF? On dev we manage the okta accounts of out own. Alyssa_DeMetro — 10/03/2022 03:06 Yep! Shubham Prakash — 10/03/2022 03:06 You can ask micheal's account creds for now so that you're not blocked by it Alyssa_DeMetro — 10/03/2022 03:06 Okay sounds good!! Shubham Prakash — 10/03/2022 03:08 Also when you're done with this one, I'll suggest you to contact mabroor for more tasks. He has been logging very less on UTA (<100hrs instead of available 1000 hrs per month). We need to log more time on UTA otherwise they'll question out ability.  Alyssa_DeMetro — 10/03/2022 03:09 Yep yep I messaged him and commented on some issues as well 👍 Alyssa_DeMetro — 10/03/2022 04:11 is this page asking for my NAF login? Image Shubham Prakash — 10/03/2022 04:11 Which brach are you trying to login? dev/stage/main Alyssa_DeMetro — 10/03/2022 04:12 Ahh yes let me see Shubham Prakash — 10/03/2022 04:13 It should not show dabblelab on this page Can you share your screen and show me? Alyssa_DeMetro — 10/03/2022 04:13 umm one sec Just needed to pull down silly me sorry! Shubham Prakash — 10/03/2022 04:13 oh.. okay Alyssa_DeMetro — 10/03/2022 04:16 Wait nevermind I assumed it was that but it's not  it's still taking me to that page Shubham Prakash — 10/03/2022 04:17 . Alyssa_DeMetro — 10/03/2022 04:17 Yep yep one sec Alyssa_DeMetro  started a call that lasted 15 minutes. `;

export async function POST(req: NextRequest) {
  try {
    console.log("Hello");
    const responsetext = await getAIResponse(SAMPLE_INPUT);
    console.log(responsetext);

    return new Response(responsetext);
  } catch (e: any) {
    console.log(e.message);
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
  }
}
