import { afterEach, describe, expect, it, vi } from "vitest";
import { extractOcr } from "../src/kyc/ocr";

const IMAGE = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // arbitrary; the fake Gemini ignores it

// Fake Gemini: every fetch resolves to a candidates response whose part text is `responseText`.
function stubGemini(responseText: string): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: responseText }] } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  );
}

afterEach(() => vi.restoreAllMocks());

describe("extractOcr", () => {
  it("parses a clean JSON model response", async () => {
    stubGemini(
      '{"firstName":"Jane","lastName":"Doe","nationalIdNumber":"A1234567","dob":"1990-05-01"}'
    );
    const result = await extractOcr(IMAGE, "image/png", "fake-key");
    expect(result).toEqual({
      firstName: "Jane",
      lastName: "Doe",
      nationalIdNumber: "A1234567",
      dob: "1990-05-01",
    });
  });

  it("extracts the JSON object when the model wraps it in prose", async () => {
    stubGemini(
      'Sure! Here is the data:\n{"firstName":"John","lastName":"Smith","nationalIdNumber":"B7654321","dob":"1985-12-20"}\nLet me know if you need more.'
    );
    const result = await extractOcr(IMAGE, "image/png", "fake-key");
    expect(result.firstName).toBe("John");
    expect(result.nationalIdNumber).toBe("B7654321");
  });

  it("returns all-null fields when the response has no parseable JSON", async () => {
    stubGemini("I cannot read this document.");
    const result = await extractOcr(IMAGE, "image/png", "fake-key");
    expect(result).toEqual({
      firstName: null,
      lastName: null,
      nationalIdNumber: null,
      dob: null,
    });
  });

  it("fills missing keys with null", async () => {
    stubGemini('{"firstName":"Jane"}');
    const result = await extractOcr(IMAGE, "image/png", "fake-key");
    expect(result).toEqual({
      firstName: "Jane",
      lastName: null,
      nationalIdNumber: null,
      dob: null,
    });
  });

  it("throws when Gemini returns a non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(extractOcr(IMAGE, "image/png", "fake-key")).rejects.toThrow();
  });
});
