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
import getTextToSpeech from "@/services/textToSpeech";
import { uploadFileToSupabase } from "@/services/fileUpload";
// import prisma from "@/lib/db";

// export const runtime = "edge";

const SYSTEM_PROMPT = `You're an assistant dedicated to helping users get a summary of a chat conversation along with summary audio. The user will enter a list of chats between two or more users. Your task is to return a summary using the provided function "generate_ssummary" such that a user can understand quickly what happened in the chat. The summary should be concise and capture the essence of the conversation.Use generate_ssummary function to generate the summary and get the summary audio URL. THE FINAL SUMMARY MUST NEVER EXCEED 4000 CHARACTERS.`;
// const SYSTEM_PROMPT = `You're an assistant dedicated to helping users get a summary of a chat conversation. The user will enter a list of chats between two or more users. Your task is to return a summary using the provided function "generate_ssummary" such that a user can understand quickly what happened in the chat. The summary should be concise and capture the essence of the conversation. In addition to the summary, at the end, you should also include a list with title TLDR; consisting of important takeaways as bullet points. Use generate_ssummary function to generate the summary. `;

const generateSummary = z.object({
  summary: z.string().describe("Summary of the chat."),
});

function validateSummaryJSON(summaryJSON: any): boolean {
  const requiredFields = ["summary"];

  for (const field of requiredFields) {
    if (!summaryJSON || !summaryJSON[field]) {
      return false;
    }
  }

  return true;
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

    const model = new ChatOpenAI({
      modelName: "gpt-4",
      temperature: 0.5,
    });

    const tools = [
      new DynamicStructuredTool({
        name: "generate_ssummary",
        description:
          "Generates summary of the chat conversation based on the input.",
        schema: generateSummary,
        func: async (input: { summary: string }) => {
          try {
            const summaryJson = input;
            const isJsonValid = validateSummaryJSON(summaryJson);

            if (!isJsonValid)
              return "The argument to the function generate_summary does not match the schema. Please try again.";

            const summary = summaryJson.summary;

            console.log(summary);

            try {
              // generate audio file from the summary text
              const audioFileBuffer = await getTextToSpeech(summary);
              if (!audioFileBuffer)
                throw new Error("Could not generate audio file");

              // store the file to supabase
              const timestamp = new Date().getTime();

              const { path } = await uploadFileToSupabase({
                fileName: `summary_${timestamp}.mp3`,
                fileBuffer: audioFileBuffer as Buffer,
              });

              if (!path) throw new Error("Could not upload file to supabase");

              const fileURL = `${process.env.SUPABASE_BUCKET_FOLDER_LOCATION}/${path}`;

              console.log(fileURL);

              return `${summary}
                You can listen to the summary [here](${fileURL}).
              `;
            } catch (e) {
              console.log((e as Error).message || e);
              return `${summary}`;
            }
          } catch (e) {
            console.log((e as Error).message);
            return `Could not generate summary due to error: ${
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
