import { Message as VercelChatMessage } from "ai";
import { NextRequest, NextResponse } from "next/server";

import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { convertToOpenAIFunction } from "@langchain/core/utils/function_calling";
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor } from "langchain/agents";
import { z } from "zod";

import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import { formatToOpenAIFunctionMessages } from "langchain/agents/format_scratchpad";
import { OpenAIFunctionsAgentOutputParser } from "langchain/agents/openai/output_parser";

export const runtime = "edge";

const formatMessage = (message: VercelChatMessage) => {
  if (message.role === "assistant") {
    return new AIMessage(message.content);
  } else {
    return new HumanMessage(message.content);
  }
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = body.messages ?? [];
    const formattedPreviousMessages = messages.slice(0, -1).map(formatMessage);

    const chatHistory: BaseMessage[] = formattedPreviousMessages;
    console.log(chatHistory);

    const currentMessageContent = messages[messages.length - 1].content;
    console.log(currentMessageContent);

    const model = new ChatOpenAI({
      modelName: "gpt-3.5-turbo",
      temperature: 0,
    });

    const tools = [
      new DynamicStructuredTool({
        name: "determine_pass_fail",
        description:
          "Check if the user passed or failed the exam based on their marks. Call this tool with the marks of all five subjects have been provided by the user.",
        schema: z.object({
          marks: z.array(z.number()).describe("Marks of all five subjects"),
        }),
        func: async (input: { marks: number[] }) => {
          if (input.marks.length !== 5) {
            throw new Error("Please provide marks for all five subjects.");
          }

          const totalmarks = input.marks.reduce((a, b) => a + b, 0);

          return totalmarks >= 200
            ? "You passed the exam Shubham! "
            : "You failed the exam Pramod.";
        },
      }),
    ];

    const modelWithFunctions = model.bind({
      functions: tools.map((tool) => convertToOpenAIFunction(tool)),
    });

    const MEMORY_KEY = "chat_history";
    const memoryPrompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        "You are an assistant that helps user determine whether the user passed the class or not. You need to get the marks of all five subjects from the user and use the provided tool to determine whether they passed or fail the exam. DO NOT DETERMINE WHETHER THE USER PASSED OR FAILED THE EXAM YOURSELF. USE THE TOOL PROVIDED TO DETERMINE WHETHER THE USER PASSED OR FAILED THE EXAM.",
      ],
      new MessagesPlaceholder(MEMORY_KEY),
      ["user", "{input}"],
      new MessagesPlaceholder("agent_scratchpad"),
    ]);

    const agentWithMemory = RunnableSequence.from([
      {
        input: (i) => i.input,
        agent_scratchpad: (i) => formatToOpenAIFunctionMessages(i.steps),
        chat_history: (i) => i.chat_history,
      },
      memoryPrompt,
      modelWithFunctions,
      new OpenAIFunctionsAgentOutputParser(),
    ]);

    /** Pass the runnable along with the tools to create the Agent Executor */
    const executorWithMemory = AgentExecutor.fromAgentAndTools({
      agent: agentWithMemory,
      tools: tools,
    });

    const result = await executorWithMemory.invoke({
      input: currentMessageContent,
      chat_history: chatHistory,
    });

    console.log(result);

    const responsetext = result.output;

    // send the text response back
    return NextResponse.json({ message: responsetext });

    // const outputParser = new HttpResponseOutputParser();

    // return new StreamingTextResponse(stream);
  } catch (e: any) {
    console.log(e.message);
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
  }
}
