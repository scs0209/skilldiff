#!/usr/bin/env node
// skilldiff CLI — entry point
// v0.0.1: commands register here; spike validates the runner before real subcommands land.

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "spike": {
    // T1 go/no-go: headless SDK run captures tool traces + baseline fetch works
    const { runSpike } = await import("../scripts/spike.js");
    await runSpike(args[0]);
    break;
  }
  case "--version":
  case "-v":
    console.log("skilldiff 0.0.1");
    break;
  default:
    console.error(`Unknown command: ${command ?? "(none)"}`);
    console.error("Usage: skilldiff <spike> | skilldiff --version");
    process.exit(1);
}
