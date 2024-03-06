import { ChatWindow } from "@/components/ChatWindow";

export default function Home() {
  const InfoCard = (
    <div className="p-4 md:p-8 rounded bg-[#25252d] w-full max-h-[85%] overflow-hidden">
      <div className="text-center max-w-xl mx-auto">
        <h1 className="text-3xl md:text-4xl mb-4">Archr Assistant</h1>
        <h2 className="text-xl mb-6">
          Transform Ideas into Plans with Archr 🚀
        </h2>
      </div>
      <p>
        Your AI-Powered Ally in Transforming App Ideas into Detailed Project
        Roadmaps. Archr is crafted to seamlessly navigate the journey from the
        initial flicker of creativity to a structured software development
        pathway.
      </p>
      <ul>
        <li className="text-l">
          🤝
          <span className="ml-2">
            <strong>Simple Start:</strong> Just bring your app idea, no tech
            talk needed.
          </span>
        </li>
        <li>
          📈
          <span>
            <strong> Detailed Planning:</strong>{" "}
            {`Get a complete blueprint,
            including what your app will do and how it'll work, without needing
            any software expertise.`}
          </span>
        </li>
        <li>
          💵
          <span className="ml-2">
            <strong> Budget and Timeline:</strong> Clarity Understand how long
            your project will take and how much it will likely cost, with
            options for every budget.
          </span>
        </li>
      </ul>
    </div>
  );
  return (
    <ChatWindow
      endpoint="api/archr-assistant"
      emoji=""
      titleText="Archr Assistant"
      placeholder="Please enter your message here"
      emptyStateComponent={InfoCard}
    ></ChatWindow>
  );
}
