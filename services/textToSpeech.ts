import openai from "@/lib/openai";

async function getTextToSpeech(text: string) {
  try {
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: text,
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    return buffer;
    // await fs.promises.writeFile(outputFile, buffer);
  } catch (err) {
    console.error((err as Error).message || err);
  }
}

export default getTextToSpeech;
