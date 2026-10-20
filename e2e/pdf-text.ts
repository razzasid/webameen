// Decode PDFKit text with embedded Unicode fonts as well as standard PDF fonts.
function searchablePdfPages(pdf: Buffer): string[] {
  const source = pdf.toString("latin1");
  const objects = new Map(
    Array.from(
      source.matchAll(/(?:^|\n)(\d+) 0 obj\b([\s\S]*?)\nendobj/g),
      ([, id, body]) => [Number(id), body ?? ""] as const,
    ),
  );
  const maps = new Map<number, Map<number, string>>();
  for (const [id, body] of objects) {
    const unicodeId = body.match(/\/ToUnicode (\d+) 0 R/)?.[1];
    if (!unicodeId) continue;
    const cmap = objects.get(Number(unicodeId)) ?? "";
    const glyphs = new Map<number, string>();
    for (const [, start, , values] of cmap.matchAll(
      /<([\da-fA-F]+)>\s*<([\da-fA-F]+)>\s*\[([\s\S]*?)\]/g,
    )) {
      const entries = Array.from((values ?? "").matchAll(/<([\da-fA-F\s]+)>/g), ([, hex]) =>
        Array.from((hex ?? "").replaceAll(/\s/g, "").matchAll(/.{4}/g), ([unit]) =>
          String.fromCharCode(Number.parseInt(unit, 16)),
        ).join(""),
      );
      entries.forEach((value, offset) => {
        glyphs.set(Number.parseInt(start ?? "0", 16) + offset, value);
      });
    }
    maps.set(id, glyphs);
  }
  const fonts = new Map(
    Array.from(
      source.matchAll(/\/(F\d+) (\d+) 0 R/g),
      ([, name, id]) => [name ?? "", maps.get(Number(id))] as const,
    ),
  );
  return Array.from(objects.values())
    .filter((body) => /\/Type \/Page\b/.test(body))
    .map((page) => {
      const contentId = page.match(/\/Contents (\d+) 0 R/)?.[1];
      const stream = objects.get(Number(contentId)) ?? "";
      let font = "";
      const text: string[] = [];
      for (const [, fontName, operands] of stream.matchAll(
        /\/(F\d+) [\d.]+ Tf|\[([\s\S]*?)\]\s*TJ/g,
      )) {
        if (fontName) {
          font = fontName;
          continue;
        }
        const glyphs = fonts.get(font);
        text.push(
          Array.from((operands ?? "").matchAll(/<([\da-fA-F]+)>/g), ([, hex]) =>
            glyphs
              ? Array.from(
                  (hex ?? "").matchAll(/.{4}/g),
                  ([code]) => glyphs.get(Number.parseInt(code, 16)) ?? "",
                ).join("")
              : Buffer.from(hex ?? "", "hex").toString("latin1"),
          ).join(""),
        );
      }
      return text.join("\n");
    });
}

export function searchablePdfText(pdf: Buffer): string {
  return searchablePdfPages(pdf).join("\n");
}
