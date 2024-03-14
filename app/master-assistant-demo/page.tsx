import { ChatWindow } from "@/components/ChatWindow";

export default function Home() {
  const InfoCard = (
    <div className="p-4 md:p-8 rounded bg-[#b7b7f5] w-full max-h-[85%] overflow-hidden">
      <div className="text-center max-w-xl mx-auto">
        <h1 className="text-3xl md:text-4xl mb-4">Master Assistant</h1>
        <h2 className="text-xl mb-6">
          Create assistants that helps you build projects 🚀
        </h2>
      </div>
    </div>
  );
  return (
    <ChatWindow
      endpoint="api/master-assistant/v1"
      emoji=""
      titleText="Master Assistant"
      placeholder="Please enter your message here"
      emptyStateComponent={InfoCard}
      showIntermediateStepsToggle={false}
    ></ChatWindow>
  );
}
