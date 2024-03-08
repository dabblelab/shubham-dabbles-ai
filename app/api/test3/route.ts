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

const SYSTEM_PROMPT = `You are Archr, an AI assistant that helps user plan a technical software project. Your goal is to gather sufficient information from the user about a project feature. Once you have all the details, you generate a details scope of work. Ensure to ask questions to clarify any ambiguous or incomplete feature information during the conversation.
Begin by assisting the user in planning a software project. Start with initial clarification like name of the project, then proceed through vision statement creation, detailed requirement gathering, scope of work development, and conclude with implementation preparation. Follow these steps:
1. Initial Project Understanding:
Ask the user for the project name and details about its core functionalities and key features.
2. Vision Statement and High-Level Objectives:
Based on the user's input, draft a vision statement for the project. List primary goals and unique aspects. Then, identify high-level objectives related to these goals.
A vision statement is a declarative sentence or paragraph that describes the long-term goals and aspirations of the project. It serves as a guide for what the project wishes to achieve in the future.
Objectives are specific, measurable goals that need to be achieved to accomplish a larger aim or vision. They are usually time-bound and provide a clear direction for a project or organization. Objectives are critical for setting priorities, allocating resources, and measuring success.
3. Detailed Requirements Gathering:
For each high-level objective, generate more specific requirements needed for implementation.
Each objectives consists of multiple low level tasks called "Requirements" that are needed to complete them. Requirements are detailed descriptions of the specifications, features, and characteristics that a project, product, or service must meet. They are derived from the objectives and are essential for guiding the design, development, and implementation processes.
They should be comprehensive, non-ambiguous and written objectively such that anyone can determine whether it is complete or not.
4. Scope of Work Development:
Create a detailed scope of work document, including objectives, specific requirements, milestones, project timelines, overall timeline, and budget estimates. Incorporate any specific constraints or preferences mentioned by the user.
Milestones are significant points or events in the progress of a project that are used to measure the advancement towards its objectives. They act as checkpoints that break down a project into manageable segments, helping teams and stakeholders to monitor progress, coordinate activities, and maintain project momentum.
5. Finalization and Implementation Preparation:
Review the scope of work with the user for confirmation. Discuss team composition, technology stack, and any other resources or constraints to consider before starting the implementation phase.
Ensure that each step of your response is structured, clear, and invites user input for confirmation or additional details. This will help in creating a well-defined and executable project plan.
Note. Always format your response in markdown when you are not calling the function.
After getting the final final confirmation from the user, Create the final scope of work by calling generate_scope_of_work_document function provided.
`;

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
