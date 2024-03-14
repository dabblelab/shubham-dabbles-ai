import { StreamingTextResponse, Message as VercelChatMessage } from "ai";
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

import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  ChatMessage,
} from "@langchain/core/messages";
import { formatToOpenAIFunctionMessages } from "langchain/agents/format_scratchpad";
import { OpenAIFunctionsAgentOutputParser } from "langchain/agents/openai/output_parser";
import prisma from "@/lib/db";

// export const runtime = "edge";

const formatMessage = (message: VercelChatMessage) => {
  if (message.role === "user") {
    return new HumanMessage(message.content);
  } else if (message.role === "assistant") {
    return new AIMessage(message.content);
  } else {
    return new ChatMessage(message.content, message.role);
  }
};

const convertVercelMessageToLangChainMessage = (message: VercelChatMessage) => {
  if (message.role === "user") {
    return new HumanMessage(message.content);
  } else if (message.role === "assistant") {
    return new AIMessage(message.content);
  } else {
    return new ChatMessage(message.content, message.role);
  }
};

const demoSchema = z.object({
  args: z.string().describe("Demo args"),
});

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const assistant_id = url.searchParams.get("assistant_id");

    if (!assistant_id) {
      return NextResponse.json(
        { error: "Assistant not found" },
        { status: 404 },
      );
    }

    const assistant = await prisma.assistant.findUnique({
      where: {
        id: assistant_id,
      },
    });

    console.log(assistant);

    if (!assistant) {
      return NextResponse.json(
        { error: "Assistant not found" },
        { status: 404 },
      );
    }

    const SYSTEM_PROMPT =
      assistant.system_prompt || `You are a helpful assistant.`;

    console.log(SYSTEM_PROMPT);

    const body = await req.json();
    console.log(body);

    const messages = body.messages ?? [];
    const formattedPreviousMessages = messages.slice(0, -1).map(formatMessage);

    const chatHistory: BaseMessage[] = formattedPreviousMessages;
    console.log(chatHistory);

    const returnIntermediateSteps = body.show_intermediate_steps;
    const previousMessages = messages
      .slice(0, -1)
      .map(convertVercelMessageToLangChainMessage);

    const currentMessageContent = messages[messages.length - 1].content;
    console.log(currentMessageContent);

    const model = new ChatOpenAI({
      modelName: "gpt-4",
      temperature: 0,
    });

    const tools = [
      new DynamicStructuredTool({
        name: "say_hi",
        description: "Demo function",
        schema: demoSchema,
        func: async (input: { args: string }) => {
          console.log(input);
          return input.args;
        },
      }),
    ];

    const modelWithFunctions = model.bind({
      functions: tools.map((tool) => convertToOpenAIFunction(tool)),
    });

    const MEMORY_KEY = "chat_history";
    const memoryPrompt = ChatPromptTemplate.fromMessages([
      ["system", SYSTEM_PROMPT],
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
      returnIntermediateSteps,
    });

    if (returnIntermediateSteps) {
      const logStream = await executorWithMemory.streamLog({
        input: currentMessageContent,
        chat_history: previousMessages,
      });

      const textEncoder = new TextEncoder();
      const transformStream = new ReadableStream({
        async start(controller) {
          for await (const chunk of logStream) {
            if (chunk.ops?.length > 0 && chunk.ops[0].op === "add") {
              const addOp = chunk.ops[0];
              if (
                addOp.path.startsWith("/logs/ChatOpenAI") &&
                typeof addOp.value === "string" &&
                addOp.value.length
              ) {
                controller.enqueue(textEncoder.encode(addOp.value));
              }
            }
          }
          controller.close();
        },
      });

      return new StreamingTextResponse(transformStream);
    } else {
      const result = await executorWithMemory.invoke({
        input: currentMessageContent,
        chat_history: chatHistory,
      });

      const responsetext = result.output;

      console.log(responsetext);

      return new Response(responsetext.toString());
    }
  } catch (e: any) {
    console.log(e.message);
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
  }
}
