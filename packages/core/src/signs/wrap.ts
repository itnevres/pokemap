import { Charmap, tokenize } from "./charmap.js";

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

    const tokenizeResult = tokenize(line, cm);
    if ("refusal" in tokenizeResult) {
      return tokenizeResult;
    }
    const tokens = tokenizeResult.tokens;

    let totalWidth = 0;
    for (const t of tokens) {
      totalWidth += cm.widthOf(t);
    }

    if (totalWidth <= width) {
      currentParagraph.push(line);
    } else {
      const words = line.split(/\s+/).filter((w) => w.length > 0);
      if (words.length === 0) {
        currentParagraph.push(line);
        continue;
      }

      const wordWidths: number[] = [];
      for (const w of words) {
        const wr = tokenize(w, cm);
        if ("refusal" in wr) return wr;
        let ww = 0;
        for (const t of wr.tokens) {
          ww += cm.widthOf(t);
        }
        wordWidths.push(ww);
      }

      const wrappedLines: string[] = [];
      let curLine = "";
      let curWidth = 0;
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const ww = wordWidths[i];
        if (curLine === "") {
          if (ww > width) {
            return { refusal: `"${w}" is longer than one line (${width}).` };
          }
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
