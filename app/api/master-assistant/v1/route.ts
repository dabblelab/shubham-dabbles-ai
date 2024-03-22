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

// const SYSTEM_PROMPT = `You are a helpful master assistant that allows users to create another AI assistant. You do this by generating appropriate system prompt for it. You will ask all the necessary questions from the user like name, description, etc. and at the end generate a system prompt based on the behaviours or features described by the user. You will confirm with the user about the list of features or assistant's behaviour and call the generate_system_prompt function provided to you at the end. You don't let the user know that you are creating a prompt rather just tell the you help them create AI assistants. If the feature requested by the user is too complex or not possible to implement, you (master assistant) should inform the user about what features/tasks can not be implemented by the new AI assistant and will require a human effort. You must create the assistant with the features/tasks that it can perform and list all the complex/unimplemented features/tasks (e.g setting up a database to store user information etc.) to the user letting them know that these feature will require human effors. Note: In case the assistant is not able to implement a feature, you should create a numbered list of tasks for a human engineer so that they can implement the left over features. This numbered list should be comprehensive with title and description.`;
const SYSTEM_PROMPT = `You're a master assistant dedicated to helping users create their own AI assistants. Your task is to gather necessary information from the user, such as the assistant's name, description, and desired behaviors. Without revealing that you're generating a prompt, you'll guide the user through the process, ensuring clarity and completeness. Once all feasible features are confirmed, you'll utilize the provided generate_system_prompt function to generate the system prompt. NOTE: If the AI assistant is not possible to be created because one or more requested feature is/are too complex or impossible to implement by you (an AI model), you'll inform the user and provide TWO DETAILED NUMBER LISTs of tasks that can be performed by the AI assistant and the other list that require human effort. This list should include titles and descriptions for each task, ensuring comprehensive guidance for human engineers to complete all the features that the AI model will not be able to implement on its own. `;

const generateSystemPrompt = z.object({
  assistant_name: z.string().describe("Name of the assistant."),
  assistant_description: z.string().describe("Description of the assistant."),
  system_prompt: z
    .string()
    .describe(
      "System prompt for the assistant. The prompt should be generated based on the features and behaviour of the assistant as described by the user.",
    ),
});

function validateSystemPromptJSON(systemPromptJSON: any): boolean {
  const requiredFields = [
    "assistant_name",
    "assistant_description",
    "system_prompt",
  ];

  for (const field of requiredFields) {
    if (!systemPromptJSON || !systemPromptJSON[field]) {
      return false;
    }
  }

  return true;
}

function jsonToMarkdown(json: any): string {
  function formatKey(key: string): string {
    return key
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  function formatObject(obj: any, indent: string = ""): string {
    let mdStr: string = "";
    if (typeof obj === "object" && obj !== null) {
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const formattedKey = formatKey(key);
          const value = obj[key];
          mdStr += `${indent}- **${formattedKey}**: `;
          if (typeof value === "object" && value !== null) {
            mdStr += "\n" + formatObject(value, indent + "  ");
          } else {
            mdStr += `${value}\n`;
          }
        }
      }
    } else {
      mdStr += `${indent}${obj}\n`;
    }
    return mdStr;
  }

  try {
    const data: any = json;
    return formatObject(data);
  } catch (e) {
    return "Invalid JSON";
  }
}

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
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
        name: "generate_system_prompt",
        description:
          "Generates a system prompt for the assistant based on the features and behaviour described by the user. At the end return the live assistant URL.",
        schema: generateSystemPrompt,
        func: async (input: {
          assistant_name: string;
          assistant_description: string;
          system_prompt: string;
        }) => {
          try {
            console.log(input);

            const systemPromptJson = input;
            console.log(systemPromptJson);

            const isJsonValid = validateSystemPromptJSON(systemPromptJson);

            if (!isJsonValid)
              return "The argument to the function generate_system_prompt does not match the schema. Please try again.";

            const assistant = await prisma.assistant.create({
              data: {
                name: input.assistant_name,
                description: input.assistant_description,
                system_prompt: input.system_prompt,
              },
            });

            if (!assistant) throw new Error("Failed to create assistant");

            return `Assistant created successfully! Please aceess the assistant here: http://localhost:3000/assistants/${assistant.id}`;
          } catch (e) {
            console.log((e as Error).message);
            return `Could not create assistant due to error: ${
              (e as Error).message
            }`;
          }
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

      // return NextResponse.json(
      //   { output: responsetext, intermediate_steps: result.intermediateSteps },
      //   { status: 200 },
      // );

      return new Response(responsetext.toString());
    }
  } catch (e: any) {
    console.log(e.message);
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
  }
}
