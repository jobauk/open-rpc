#!/usr/bin/env node

const path = require("node:path");
const { generate } = require(path.join(__dirname, "../dist/lib/index.js"));

if (process.argv.length <= 2) {
  console.error(
    'Please provide a valid input and output argument. e.g. "https://my-api.com/open-api.json -o types/types.gen.ts"',
  );
  process.exit();
}

const input = process.argv[2];
const inputSrc = input.startsWith("http")
  ? input
  : path.join(process.cwd(), input);
const output = process.argv[4].split("/");
const outputFile = output.pop();
const outputDir = output.join("/");

if (!URL.canParse(inputSrc)) {
  console.log("The open-api source must be a valid url or file path.");
  process.exit();
}

if (!outputFile.endsWith(".ts")) {
  console.log("The output file must be a typescript file (.ts).");
  process.exit();
}

console.log("Generating...");

generate(inputSrc, outputDir, outputFile)
  .then(() => console.log(`Successfully generated at: ${process.argv[4]}`))
  .catch((error) => console.error(error));
