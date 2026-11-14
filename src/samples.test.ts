import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { expandGlobs, viteJsonGlob } from "./glob-plugin.ts";
import { createCanvasSamples } from "./samples.ts";
import type { BoardMeta } from "./snapshot.ts";

const meta = (file: string, extra: Partial<BoardMeta> = {}): BoardMeta => ({
  file,
  title: null,
  page: null,
  w: 1,
  h: 1,
  ...extra,
});
const COPY = { hash: "h", version: "v1" };

describe("createCanvasSamples", () => {
  const { canvasSample, canvasHas, canvasKeys } = createCanvasSamples({
    "./a.meta.json": meta("A.dc.html", {
      copy: COPY,
      samples: { "page.title": "Hello", "page.sub": "World" },
    }),
    "./b.meta.json": meta("B.dc.html", { copy: COPY }),
    "./c.meta.json": meta("C.dc.html", { samples: { "x.y": "not copied" } }),
  });

  it("reads a value the board marks", () =>
    expect(canvasSample("A.dc.html", "page.title")).toBe("Hello"));
  it("names the board and key when the snapshot lacks it", () =>
    expect(() => canvasSample("A.dc.html", "page.nope")).toThrow(
      /page\.nope.*A\.dc\.html.*refresh/,
    ));
  it("ignores a board whose copy was never read", () =>
    expect(canvasHas("C.dc.html", "x.y")).toBe(false));
  it("says whether a key is marked, and lists keys in order; none for a board that marks nothing", () => {
    expect(canvasHas("A.dc.html", "page.sub")).toBe(true);
    expect(canvasHas("A.dc.html", "page.nope")).toBe(false);
    expect(canvasKeys("A.dc.html")).toEqual(["page.title", "page.sub"]);
    expect(canvasKeys("B.dc.html")).toEqual([]);
    expect(canvasKeys("Missing.dc.html")).toEqual([]);
  });
});

describe("createCanvasSamples extras", () => {
  const { canvasSample, canvasKeys, canvasSampleOrNull } = createCanvasSamples(
    {
      "./a.meta.json": meta("A.dc.html", {
        copy: COPY,
        samples: { "a.b": "board", "a.c": "kept" },
      }),
      "./b.meta.json": meta("B.dc.html", { samples: { "x.y": "marked" } }),
    },
    {
      extras: {
        "A.dc.html": { "a.b": "passed" },
        "B.dc.html": { "x.z": "only passed" },
      },
    },
  );
  it("lets an extra win over the board, and keeps the board values it does not name", () => {
    expect(canvasSample("A.dc.html", "a.b")).toBe("passed");
    expect(canvasSample("A.dc.html", "a.c")).toBe("kept");
  });
  it("counts a board with extras though its copy was never read", () =>
    expect(canvasKeys("B.dc.html")).toEqual(["x.y", "x.z"]));
  it("gives null for a key the board lacks", () => {
    expect(canvasSampleOrNull("A.dc.html", "a.nope")).toBeNull();
    expect(canvasSampleOrNull("A.dc.html", "a.b")).toBe("passed");
  });
});

describe("expandGlobs", () => {
  it("expands a glob whose type argument holds generics, objects and a multi-line call, and leaves the rest", () => {
    const dir = mkdtempSync(join(tmpdir(), "db-glob-"));
    try {
      mkdirSync(join(dir, "b"));
      writeFileSync(join(dir, "b", "one.passed.json"), '{"k":"v"}');
      const source = [
        "const a = import.meta.glob<Record<string, string>>('./b/*.passed.json', { eager: true, import: 'default' })",
        "const b = import.meta.glob<{ file: string; samples?: Record<string, string> }>(\n  './b/*.passed.json',\n  { eager: true },\n)",
        "const c = import.meta.glob('./b/*.ts')",
      ].join("\n");
      const out = expandGlobs(source, dir);
      expect(out.match(/import\.meta\.glob/g)).toHaveLength(1);
      expect(out.match(/"k":"v"/g)).toHaveLength(2);
      expect(out).toContain("import.meta.glob('./b/*.ts')");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the samples entry", () => {
  it("imports nothing from Node, so Vite can bundle it", () => {
    expect(
      readFileSync(join(import.meta.dirname, "samples.ts"), "utf8"),
    ).not.toMatch(/from\s+['"]node:/);
  });
});

describe("viteJsonGlob", () => {
  it("bundles a board's meta file, read from disk through the glob, into canvasSample", async () => {
    const esbuild = await import("esbuild");
    const dir = mkdtempSync(join(tmpdir(), "db-samples-"));
    try {
      mkdirSync(join(dir, "boards"));
      writeFileSync(
        join(dir, "boards", "Home.meta.json"),
        JSON.stringify(
          meta("Home.dc.html", {
            copy: COPY,
            samples: { "page.title": "From disk" },
          }),
        ),
      );
      writeFileSync(join(dir, "boards", "Other.txt"), "not json");
      const entry = join(dir, "read.ts");
      writeFileSync(
        entry,
        `import { createCanvasSamples } from ${JSON.stringify(join(import.meta.dirname, "samples.ts"))}
export const { canvasSample } = createCanvasSamples(import.meta.glob<any>('./boards/*.meta.json', { eager: true, import: 'default' }))
export const untouched = import.meta.glob('./boards/*.txt')
`,
      );
      const out = join(dir, "out.mjs");
      await esbuild.build({
        entryPoints: [entry],
        outfile: out,
        bundle: true,
        format: "esm",
        platform: "node",
        logLevel: "silent",
        plugins: [viteJsonGlob()],
      });
      expect(readFileSync(out, "utf8")).toContain("import.meta.glob("); // the non-JSON glob is left for the project to handle
      const { canvasSample } = (await import(out)) as {
        canvasSample: (b: string, k: string) => string;
      };
      expect(canvasSample("Home.dc.html", "page.title")).toBe("From disk");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
