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

export const runtime = "edge";

const SYSTEM_PROMPT = `You are a helpful assistant.`;

const generateScopeOfWorkDocumentZodSchema = z.object({
  project_name: z.string().describe("Name of the project."),
  project_vision: z
    .string()
    .describe(
      "A vision statement is a declarative sentence or paragraph that describes the long-term goals and aspirations of the project. It serves as a guide for what the project wishes to achieve in the future. ",
    ),
  milestones: z.array(
    z.object({
      milestone: z
        .string()
        .describe(
          "Milestones are significant points or events in the progress of a project that are used to measure the advancement towards its objectives. They act as checkpoints that break down a project into manageable segments, helping teams and stakeholders to monitor progress, coordinate activities, and maintain project momentum.",
        ),
      objectives: z.array(
        z
          .object({
            title: z
              .string()
              .describe(
                "The title of the objective. It should be short and descriptive.",
              ),
            description: z
              .string()
              .describe(
                "The description of the objective. It should be comprehensive, non-ambiguous and written objectively such that anyone can determine whether it is complete or not.",
              ),
            requirements: z
              .array(
                z
                  .object({
                    title: z
                      .string()
                      .describe(
                        "The title of the requirement. It should be short and descriptive.",
                      ),
                    description: z
                      .string()
                      .describe(
                        "The description of the requirement. It should be comprehensive, non-ambiguous and description written objectively such that anyone can determine whether it is complete or not.",
                      ),
                  })
                  .describe("An requirement of an objective"),
              )
              .describe(
                "The requirements of the objective that are needed to be completed in order to complete the objective.",
              ),
          })
          .describe(
            "An objective of a milestone. Objectives are specific, measurable goals that need to be achieved to accomplish a larger aim or vision. They are usually time-bound and provide a clear direction for a project or organization. Objectives are critical for setting priorities, allocating resources, and measuring success.",
          ),
      ),
    }),
  ),
  other_considerations: z
    .string()
    .describe("Include any other considerations needed for the project."),
  project_timelines: z
    .string()
    .describe(
      "An estimate of time required in weeks to complete each milestone. e.g: Milestone 1: 2 weeks, Milestone 2: 3 weeks",
    ),
  overall_timeline: z
    .string()
    .describe(
      "Total time in weeks required to complete the project. This is the sum of timelines of each milestone.",
    ),
  budget_estimates: z
    .string()
    .describe(
      "Describe how budget can be calculated and things needed to consider to estimate it.",
    ),
});

function validateSOWDocumentJSON(sowDocumentJSON: any): boolean {
  const requiredFields = [
    "project_name",
    "project_vision",
    "milestones",
    // 'other_considerations',
    // 'project_timelines',
    // 'budget_estimates'
  ];

  for (const field of requiredFields) {
    if (!sowDocumentJSON || !sowDocumentJSON[field]) {
      return false;
    }
  }

  if (!sowDocumentJSON.milestones) {
    return false;
  }

  if (!Array.isArray(sowDocumentJSON.milestones)) {
    return false;
  }

  if (sowDocumentJSON.milestones.length === 0) {
    return false;
  }

  for (const milestone of sowDocumentJSON.milestones) {
    if (!milestone.objectives || !milestone.objectives.length) {
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
        name: "generate_scope_of_work_document",
        description:
          "Create a detailed scope of work document, Should only be called after getting all the necessary details from the user at the end.",
        schema: generateScopeOfWorkDocumentZodSchema,
        func: async (input: {
          project_name: string;
          project_vision: string;
          milestones: {
            milestone: string;
            objectives: {
              title: string;
              description: string;
              requirements: { title: string; description: string }[];
            }[];
          }[];
          other_considerations: string;
          project_timelines: string;
          overall_timeline: string;
          budget_estimates: string;
        }) => {
          console.log(input);

          const documentJSON = input;
          console.log(documentJSON);

          const isDocJSONValid = validateSOWDocumentJSON(documentJSON);

          if (!isDocJSONValid)
            return "The argument to the function generate_scope_of_work_document does not match the schema. Please try again.";

          const documentInMD = jsonToMarkdown(documentJSON);
          return documentInMD;
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
