// import { z } from "zod";
// import { zodToJsonSchema } from "zod-to-json-schema";

// import { ChatOpenAI } from "@langchain/openai";
// import { PromptTemplate } from "@langchain/core/prompts";
// // import { JsonOutputFunctionsParser } from "langchain/output_parsers";

// const TEMPLATE = `Extract the requested fields from the input.

// The field "entity" refers to the first mentioned entity in the input.

// Input:

// {input}`;

// /**
//  * This handler initializes and calls an OpenAI Functions powered
//  * structured output chain. See the docs for more information:
//  *
//  * https://js.langchain.com/docs/modules/chains/popular/structured_output
//  */
// export async function test(input: string) {
//   try {
//     const prompt = PromptTemplate.fromTemplate(TEMPLATE);
//     /**
//      * Function calling is currently only supported with ChatOpenAI models
//      */
//     const model = new ChatOpenAI({
//       temperature: 0.8,
//       modelName: "gpt-3.5-turbo-1106",
//     });

//     /**
//      * We use Zod (https://zod.dev) to define our schema for convenience,
//      * but you can pass JSON Schema directly if desired.
//      */
//     const schema = z.object({
//       tone: z
//         .enum(["positive", "negative", "neutral"])
//         .describe("The overall tone of the input"),
//       entity: z.string().describe("The entity mentioned in the input"),
//       word_count: z.number().describe("The number of words in the input"),
//       chat_response: z.string().describe("A response to the human's input"),
//       final_punctuation: z
//         .optional(z.string())
//         .describe("The final punctuation mark in the input, if any."),
//     });

//     /**
//      * Bind the function and schema to the OpenAI model.
//      * Future invocations of the returned model will always use these arguments.
//      *
//      * Specifying "function_call" ensures that the provided function will always
//      * be called by the model.
//      */
//     const functionCallingModel = model.bind({
//       functions: [
//         {
//           name: "output_formatter",
//           description: "Should always be used to properly format output",
//           parameters: zodToJsonSchema(schema),
//         },
//       ],
//       function_call: { name: "output_formatter" },
//     });

//     /**
//      * Returns a chain with the function calling model.
//      */
//     const chain = prompt.pipe(functionCallingModel);
//     // .pipe(new JsonOutputFunctionsParser());

//     const result = await chain.invoke({
//       input: input,
//     });

//     return result;
//   } catch (e) {
//     console.log((e as Error).message);
//   }
// }
