import { supabase } from "../lib/supabase";

export const BUCKET_NAME = "discord-bot-audio";
export const FOLDER_NAME = "audioFromAssistant";

export async function uploadFileToSupabase({
  fileName,
  fileBuffer,
}: {
  fileName: string;
  fileBuffer: Buffer;
}): Promise<any> {
  const file = new Blob([fileBuffer]);
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(`${FOLDER_NAME}/${fileName}`, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    console.error("Error uploading file:", error);
  }

  return data;
}
