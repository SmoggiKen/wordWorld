export function buildScanPrompt(criteria) {
  const schemaLines = criteria.map((criterion) => {
    return `- "${criterion.key}": ${criterion.prompt_text}`;
  }).join("\n");

  const keys = criteria.map((criterion) => `"${criterion.key}"`).join(", ");

  return `You are helping a young child feel motivated about writing.
Look at the handwritten page and identify only whether these positive writing features are present.

Checks:
${schemaLines}

Return JSON only. Use exactly these keys: ${keys}.
Each value must be a boolean. Do not include comments, markdown, scores, or corrections.`;
}

export function mockAnalyzeWriting(criteria) {
  const defaults = {
    capital_letter: true,
    full_stop: true,
    complete_sentence: true,
    visible_spaces: true,
    adjective: false,
    because: false
  };

  return Object.fromEntries(criteria.map((criterion) => {
    return [criterion.key, defaults[criterion.key] ?? false];
  }));
}

export async function analyzeWritingImage({ imageBuffer, mimeType, criteria }) {
  if (process.env.AI_MOCK === "true" || !process.env.OPENAI_API_KEY) {
    return mockAnalyzeWriting(criteria);
  }

  try {
    const dataUrl = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: buildScanPrompt(criteria) },
              { type: "input_image", image_url: dataUrl, detail: "high" }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI request failed: ${response.status} ${extractOpenAIError(body)}`);
    }

    const payload = await response.json();
    const outputText = payload.output_text || extractOutputText(payload);
    const parsed = parseJsonObject(outputText);

    return Object.fromEntries(criteria.map((criterion) => {
      return [criterion.key, Boolean(parsed[criterion.key])];
    }));
  } catch (error) {
    if (process.env.AI_FALLBACK_ON_ERROR === "true") {
      console.warn(`AI assessment failed, using mock result: ${error.message}`);
      return mockAnalyzeWriting(criteria);
    }
    throw new Error(`Assessment AI failed: ${error.message}`);
  }
}

function extractOutputText(payload) {
  const chunks = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n");
}

function parseJsonObject(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("AI returned an empty result");

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("AI returned a non-JSON result");
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

function extractOpenAIError(body) {
  try {
    const parsed = JSON.parse(body);
    return parsed.error?.message || body;
  } catch {
    return body;
  }
}
