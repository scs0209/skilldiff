#!/usr/bin/env node
// skilldiff CLI — entry point
// Commands:
//   spike            go/no-go harness validation
//   run <scenario>   run a behavior-diff scenario (recorded, live, or batch)
//   orbit <old> <new>  render two runs as a behavior-engine scene
//   orbit --old ... --new ... --scenario ...  render a failure-rate batch

import { resolve } from "node:path";

function usage(): never {
  console.error(`Usage:
  skilldiff demo                    10-second demo — bundled example, opens the behavior diff
  skilldiff init [dir]              discover skills, emit starter scenarios
  skilldiff run <scenario.yaml> [--old recorded.json] [--new recorded.json]
                 [--live] [--base <git-ref>] [--repeat N]
  skilldiff orbit <old.json> <new.json> [--scenario <scenario.yaml>]
                 [--out orbit.html] [--name "..."]
  skilldiff orbit --old a.json [--old b.json ...] --new x.json [--new y.json ...]
                 --scenario <scenario.yaml> [--out orbit.html] [--name "..."]
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
    let repeat = 1;
    let i = 1;
    while (i < args.length) {
      const a = args[i++];
      if (a === "--old") oldTrace = args[i++];
      else if (a === "--new") newTrace = args[i++];
      else if (a === "--live") live = true;
      else if (a === "--base") base = args[i++];
      else if (a === "--repeat") repeat = Number(args[i++]);
      else usage();
    }
    if (!Number.isFinite(repeat) || repeat < 1) {
      console.error(`--repeat must be a positive integer (got ${repeat})`);
      usage();
    }

    const { loadScenario } = await import("./scenario.js");
    const { runScenario } = await import("./runner.js");

    const scenario = await loadScenario(scenarioPath);
    const result = await runScenario(scenario, {
      oldTrace: oldTrace ? resolve(oldTrace) : undefined,
      newTrace: newTrace ? resolve(newTrace) : undefined,
      live,
      base,
      repeat,
    });

    console.log(result.report);
    process.exit(result.passed ? 0 : 1);
    break;
  }
  case "demo": {
    const { runDemo } = await import("./demo.js");
    const { passed, orbitPath } = await runDemo();
    if (!process.stdout.isTTY) {
      console.log(`orbit: ${orbitPath}`);
    }
    process.exit(passed ? 0 : 1);
    break;
  }
  case "init": {
    const { runInit, printInitSummary } = await import("./init.js");
    const result = await runInit(resolve(args[0] ?? process.cwd()));
    printInitSummary(result);
    break;
  }
  case "orbit": {
    let out: string | undefined;
    let name: string | undefined;
    let scenarioPath: string | undefined;
    const oldPaths: string[] = [];
    const newPaths: string[] = [];
    const positional: string[] = [];
    let i = 0;
    while (i < args.length) {
      const a = args[i++];
      if (a === "--out") out = args[i++];
      else if (a === "--name") name = args[i++];
      else if (a === "--scenario") scenarioPath = args[i++];
      else if (a === "--old") oldPaths.push(args[i++]);
      else if (a === "--new") newPaths.push(args[i++]);
      else positional.push(a);
    }

    if (oldPaths.length || newPaths.length) {
      if (!scenarioPath || oldPaths.length === 0 || newPaths.length === 0) usage();

      const { loadScenario } = await import("./scenario.js");
      const { writeRateOrbit } = await import("./orbit.js");
      const scenario = await loadScenario(resolve(scenarioPath));
      await writeRateOrbit({
        oldTraces: oldPaths.map((p) => resolve(p)),
        newTraces: newPaths.map((p) => resolve(p)),
        expect: scenario.expect,
        out,
        name: name ?? scenario.name,
      });
      console.log(
        `rate orbit written: ${resolve(out ?? "orbit.html")} (${oldPaths.length}\u00D7${newPaths.length} runs)`,
      );
    } else {
      const { writeOrbit } = await import("./orbit.js");
      const oldPath = positional[0];
      const newPath = positional[1];
      if (!oldPath || !newPath) usage();
      let expect;
      if (scenarioPath) {
        const { loadScenario } = await import("./scenario.js");
        const scenario = await loadScenario(resolve(scenarioPath));
        expect = scenario.expect;
        name = name ?? scenario.name;
      }
      await writeOrbit(resolve(oldPath), resolve(newPath), { out, name, expect });
      console.log(`orbit written: ${resolve(out ?? "orbit.html")}`);
    }
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