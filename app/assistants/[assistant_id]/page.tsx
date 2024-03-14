import { DynamicAssistantChatWindow } from "@/components/DynamicAssistantChatWindow";
import prisma from "@/lib/db";

export default async function Home({
  params,
  searchParams,
}: {
  params: { assistant_id: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { assistant_id } = params;

  if (!assistant_id) {
    return <div>Assistant not found</div>;
  }

  const assistant = await prisma.assistant.findUnique({
    where: {
      id: assistant_id,
    },
    select: {
      name: true,
      description: true,
    },
  });

  console.log(assistant);

  const InfoCard = (
    <div className="p-4 md:p-8 rounded bg-[#b7b7f5] w-full max-h-[85%] overflow-hidden">
      <div className="text-center max-w-xl mx-auto">
        <h1 className="text-3xl md:text-4xl mb-4">
          {assistant?.name || "Dynamic Assistant"}
        </h1>
        <h2 className="text-xl mb-6">
          {assistant?.description || "Dynamic description 🚀"}
        </h2>
      </div>
    </div>
  );
  return (
    <DynamicAssistantChatWindow
      endpoint={`/api/dynamic-assistant/v1?assistant_id=${assistant_id}`}
      assistantId={assistant_id}
      emoji=""
      titleText={assistant?.name || "Dynamic Assistant"}
      assistantDescription={assistant?.description || "Dynamic description 🚀"}
      placeholder="Please enter your message here"
      emptyStateComponent={InfoCard}
      showIntermediateStepsToggle={false}
    ></DynamicAssistantChatWindow>
  );
}
