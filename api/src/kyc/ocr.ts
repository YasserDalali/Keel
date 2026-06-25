export type OcrResult = {
  firstName: string | null;
  lastName: string | null;
  nationalIdNumber: string | null;
  dob: string | null;
};

const GEMINI_MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const PROMPT =
  "You are an OCR engine for identity documents. Extract these fields from the ID " +
  "image and reply with ONLY a JSON object, no prose: " +
  '{"firstName": string, "lastName": string, "nationalIdNumber": string, "dob": "YYYY-MM-DD"}. ' +
  "Use null for any field you cannot read.";

// btoa needs a binary string; chunk so we never spread a multi-MB array onto the call stack.
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

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

export async function extractOcr(
  image: Uint8Array,
  mimeType: string,
  apiKey: string
): Promise<OcrResult> {
  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mimeType, data: toBase64(image) } },
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini OCR failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  const parsed = parseModelJson(text);
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
