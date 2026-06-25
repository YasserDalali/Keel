export type OcrResult = {
  firstName: string | null;
  lastName: string | null;
  nationalIdNumber: string | null;
  dob: string | null;
};

const VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

const PROMPT =
  "You are an OCR engine for identity documents. Extract these fields from the ID " +
  "image and reply with ONLY a JSON object, no prose: " +
  '{"firstName": string, "lastName": string, "nationalIdNumber": string, "dob": "YYYY-MM-DD"}. ' +
  "Use null for any field you cannot read.";

// Pull the first balanced {...} block out of arbitrary model text, then JSON.parse it.
function parseModelJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function extractOcr(image: Uint8Array, ai: Ai): Promise<OcrResult> {
  const response = (await ai.run(VISION_MODEL, {
    image: Array.from(image),
    prompt: PROMPT,
    max_tokens: 256,
  } as never)) as { response?: string };

  const parsed = parseModelJson(response.response ?? "");
  if (!parsed) {
    return { firstName: null, lastName: null, nationalIdNumber: null, dob: null };
  }

  return {
    firstName: asStringOrNull(parsed.firstName),
    lastName: asStringOrNull(parsed.lastName),
    nationalIdNumber: asStringOrNull(parsed.nationalIdNumber),
    dob: asStringOrNull(parsed.dob),
  };
}
