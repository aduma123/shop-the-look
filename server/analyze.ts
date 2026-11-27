import Anthropic from "@anthropic-ai/sdk";

export interface LookItem {
  category: string;
  name: string;
  description: string;
  color: string;
  brand: string;
  match: "exact" | "similar";
  price: number;
  currency: string;
  retailer: string;
  url: string;
}

export interface Look {
  summary: string;
  currency: string;
  total: number;
  items: LookItem[];
}

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const MODEL = "claude-sonnet-5-5";
const MAX_TURNS = 4;
// Web searches allowed per photo, across all turns. Each search costs about $0.01 plus input tokens.
const MAX_SEARCHES = 8;

const SYSTEM = `You are a fashion stylist and personal shopper.
You receive one outfit photo (inspiration image, street style, or a model wearing a look).

1. Identify every visible clothing item and accessory, top to bottom: outerwear, tops, bottoms, dresses, shoes, bags, jewelry, belts, hats, eyewear, and so on. Skip items you cannot see.
2. For each item, use web search to find a product someone can buy today. You have at most ${MAX_SEARCHES} searches in total, so plan for about one per item and look the next item up rather than retrying one item many times. Prefer the exact product when the brand is identifiable ("exact"); otherwise find the closest similar piece at a mainstream retailer ("similar").
3. Take the price, retailer and product URL from the search results. Never invent a URL or a price: if you cannot confirm a price, pick another product you can confirm.
4. Use one currency for every item (USD unless the image clearly points to another market) and set total to the sum of the item prices.

When done, call submit_look exactly once with the full list. Do not write the list as text.`;

const submitLookTool: Anthropic.Beta.BetaTool = {
  name: "submit_look",
  description: "Submit the finished shoppable breakdown of the outfit.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "currency", "total", "items"],
    properties: {
      summary: { type: "string", description: "One short sentence describing the overall look." },
      currency: { type: "string", description: "ISO 4217 code, e.g. USD." },
      total: { type: "number", description: "Sum of all item prices." },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "category", "name", "description", "color", "brand",
            "match", "price", "currency", "retailer", "url",
          ],
          properties: {
            category: { type: "string", description: "e.g. Outerwear, Top, Bottom, Shoes, Bag, Jewelry." },
            name: { type: "string", description: "Product name as listed by the retailer." },
            description: { type: "string", description: "Short description of the item as seen in the photo." },
            color: { type: "string" },
            brand: { type: "string" },
            match: { type: "string", enum: ["exact", "similar"] },
            price: { type: "number" },
            currency: { type: "string" },
            retailer: { type: "string" },
            url: { type: "string", description: "Product page URL taken from search results." },
          },
        },
      },
    },
  },
};

export class AnalyzeError extends Error {}

export async function analyzeLook(
  client: Anthropic,
  imageBase64: string,
  mediaType: ImageMediaType,
): Promise<Look> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
        { type: "text", text: "Shop this look: list every item with a price." },
      ],
    },
  ];

  let searchesUsed = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // max_uses applies per request, so pass only what is left of the photo's budget.
    // The API needs at least 1; once the budget is spent the model is told to stop searching.
    const searchesLeft = Math.max(1, MAX_SEARCHES - searchesUsed);
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: SYSTEM,
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: searchesLeft },
        submitLookTool,
      ],
      messages,
    });

    searchesUsed += response.usage.server_tool_use?.web_search_requests ?? 0;

    if (response.stop_reason === "refusal") {
      throw new AnalyzeError("This image could not be analyzed. Try a different photo.");
    }

    const submit = response.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "submit_look",
    );
    if (submit) {
      if (response.stop_reason === "max_tokens") {
        throw new AnalyzeError("The result was cut off. Please try again.");
      }
      return normalize(submit.input as Look);
    }

    if (response.stop_reason === "pause_turn") {
      // Long server-side search turn: send it back so the server continues it.
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    // Finished without submitting: ask once more for the tool call.
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: "Do not search any more. Call submit_look now with the items you have found.",
    });
  }

  throw new AnalyzeError("Could not finish analyzing this look. Please try again.");
}

function normalize(look: Look): Look {
  const items = look.items.filter((i) => Number.isFinite(i.price) && i.price >= 0);
  const total = Math.round(items.reduce((sum, i) => sum + i.price, 0) * 100) / 100;
  return { ...look, items, total };
}
