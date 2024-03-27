import { ChatWindow } from "@/components/ChatWindow";

export default function Home() {
  const InfoCard = (
    <div className="p-4 md:p-8 rounded bg-[#b7b7f5] w-full max-h-[85%] overflow-hidden">
      <div className="text-center max-w-xl mx-auto">
        <h1 className="text-3xl md:text-4xl mb-4">Chat Summarizer</h1>
        <h2 className="text-xl mb-6">Get a summary of chat</h2>
      </div>
    </div>
  );
  return (
    <ChatWindow
      endpoint="api/chat-summarizer/v1"
      emoji=""
      titleText="Chat summarizer"
      placeholder="Please enter your message here"
      emptyStateComponent={InfoCard}
      showIntermediateStepsToggle={false}
    ></ChatWindow>
  );
}
