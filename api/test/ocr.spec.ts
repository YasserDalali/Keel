import { describe, expect, it } from "vitest";
import { extractOcr } from "../src/kyc/ocr";

// A fake AI binding: its run() returns whatever `response` text we give it.
function fakeAi(responseText: string) {
  return { run: async () => ({ response: responseText }) } as unknown as Ai;
}

const IMAGE = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // arbitrary; the fake AI ignores it

describe("extractOcr", () => {
  it("parses a clean JSON model response", async () => {
    const ai = fakeAi(
      '{"firstName":"Jane","lastName":"Doe","nationalIdNumber":"A1234567","dob":"1990-05-01"}'
    );
    const result = await extractOcr(IMAGE, ai);
    expect(result).toEqual({
      firstName: "Jane",
      lastName: "Doe",
      nationalIdNumber: "A1234567",
      dob: "1990-05-01",
    });
  });

  it("extracts the JSON object when the model wraps it in prose", async () => {
    const ai = fakeAi(
      'Sure! Here is the data:\n{"firstName":"John","lastName":"Smith","nationalIdNumber":"B7654321","dob":"1985-12-20"}\nLet me know if you need more.'
    );
    const result = await extractOcr(IMAGE, ai);
    expect(result.firstName).toBe("John");
    expect(result.nationalIdNumber).toBe("B7654321");
  });

  it("returns all-null fields when the response has no parseable JSON", async () => {
    const ai = fakeAi("I cannot read this document.");
    const result = await extractOcr(IMAGE, ai);
    expect(result).toEqual({
      firstName: null,
      lastName: null,
      nationalIdNumber: null,
      dob: null,
    });
  });

  it("fills missing keys with null", async () => {
    const ai = fakeAi('{"firstName":"Jane"}');
    const result = await extractOcr(IMAGE, ai);
    expect(result).toEqual({
      firstName: "Jane",
      lastName: null,
      nationalIdNumber: null,
      dob: null,
    });
  });
});
