import type { Charmap } from "./charmap.js";
import { tokenize } from "./charmap.js";

export const SIGN_WIDTH = 18;

// Helper: compute total width of a line, or return refusal
function widthOfLine(
  line: string,
  cm: Charmap
): { width: number } | { refusal: string } {
  const result = tokenize(line, cm);
  if ("refusal" in result) return result;
  let width = 0;
  for (const t of result.tokens) {
    width += cm.widthOf(t);
  }
  return { width };
}

export function wrapSign(
  input: string,
  cm: Charmap,
  width: number
): { paragraphs: string[][] } | { refusal: string } {
  const lines = input.split(/\r?\n/);
  const paragraphs: string[][] = [];
  let currentParagraph: string[] = [];

  for (const line of lines) {
    if (line === "") {
      if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph);
        currentParagraph = [];
      }
      continue;
    }

    const lineResult = widthOfLine(line, cm);
    if ("refusal" in lineResult) {
      return lineResult;
    }
    if (lineResult.width <= width) {
      currentParagraph.push(line);
    } else {
      const words = line.split(/\s+/).filter((w) => w.length > 0);
      if (words.length === 0) {
        currentParagraph.push(line);
        continue;
      }

      // Compute width of each word
      const wordWidths: number[] = [];
      for (const w of words) {
        const wr = widthOfLine(w, cm);
        if ("refusal" in wr) return wr;
        wordWidths.push(wr.width);
      }

      const wrappedLines: string[] = [];
      let curLine = "";
      let curWidth = 0;
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const ww = wordWidths[i];
        if (w === undefined || ww === undefined) {
          // This should not happen, but guard to satisfy TypeScript
          throw new Error("Unexpected undefined word or width");
        }
        if (ww > width) {
          return { refusal: `"${w}" is longer than one line (${width}).` };
        }
        if (curLine === "") {
          curLine = w;
          curWidth = ww;
        } else {
          if (curWidth + 1 + ww <= width) {
            curLine += " " + w;
            curWidth += 1 + ww;
          } else {
            wrappedLines.push(curLine);
            curLine = w;
            curWidth = ww;
          }
        }
      }
      if (curLine !== "") {
        wrappedLines.push(curLine);
      }

      for (const wl of wrappedLines) {
        currentParagraph.push(wl);
      }
    }
  }

  if (currentParagraph.length > 0) {
    paragraphs.push(currentParagraph);
  }

  return { paragraphs };
}
