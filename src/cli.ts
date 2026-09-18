#!/usr/bin/env node
// skilldiff CLI — entry point
// Commands:
//   spike            go/no-go harness validation
//   run <scenario>   run a behavior-diff scenario (recorded or live)

import { resolve } from "node:path";

function usage(): never {
  console.error(`Usage:
  skilldiff init [dir]              discover skills, emit starter scenarios
  skilldiff run <scenario.yaml> [--old recorded.json] [--new recorded.json]
                 [--live] [--base <git-ref>]
  skilldiff spike [fixture-path]
  skilldiff --version`);
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "spike": {
    const { runSpike } = await import("../scripts/spike.js");
    await runSpike(args[0]);
    break;
  }
  case "run": {
    const scenarioPath = args[0];
    if (!scenarioPath) usage();

    let oldTrace: string | undefined;
    let newTrace: string | undefined;
    let live = false;
    let base: string | undefined;
    for (let i = 1; i < args.length; i++) {
      if (args[i] === "--old") oldTrace = args[++i];
      else if (args[i] === "--new") newTrace = args[++i];
      else if (args[i] === "--live") live = true;
      else if (args[i] === "--base") base = args[++i];
      else usage();
    }

    const { loadScenario } = await import("./scenario.js");
    const { runScenario } = await import("./runner.js");

    const scenario = await loadScenario(scenarioPath);
    const result = await runScenario(scenario, {
      oldTrace: oldTrace ? resolve(oldTrace) : undefined,
      newTrace: newTrace ? resolve(newTrace) : undefined,
      live,
      base,
    });

    console.log(result.report);
    process.exit(result.passed ? 0 : 1);
    break;
  }
  case "init": {
    const { runInit, printInitSummary } = await import("./init.js");
    const result = await runInit(resolve(args[0] ?? process.cwd()));
    printInitSummary(result);
    break;
  }
  case "--version":
  case "-v":
    console.log("skilldiff 0.1.0");
    break;
  default:
    console.error(`Unknown command: ${command ?? "(none)"}`);
    usage();
}
