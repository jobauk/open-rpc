#!/usr/bin/env node

import { generate } from "../lib/gen";

const openApiUrl = process.argv[2];
const output = process.argv[4].split("/");
const outputFile = output.pop();
const outputDir = output.join("/");

if (!URL.canParse(openApiUrl)) {
  console.log("The open-api source must be a valid url.");
  process.exit();
}

if (!outputFile.endsWith(".ts")) {
  console.log("The output file must be a typescript file (.ts).");
  process.exit();
}

console.log("Generating...");

try {
  console.log(outputDir, outputFile);
  await generate(openApiUrl, outputDir, outputFile);
  console.log(`Successfully generated at: ${process.argv[4]}`);
} catch (error) {
  console.error(error);
}
