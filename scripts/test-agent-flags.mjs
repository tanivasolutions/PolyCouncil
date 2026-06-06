import {
  buildFlagFollowUpUserMessage,
  detectAgentFlags,
} from "../src/agent-flags.js";

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error("FAIL:", message);
    failed += 1;
  } else {
    console.log("OK:", message);
  }
}

const masonText = `
Great opportunity on the Birmingham lane.

Flag to Reid: Model whether $28/trip clears our margin floor after labor and fuel.

Flag to Leo: Confirm driver credentials for NEMT before we commit.
`;

const flags = detectAgentFlags("mason", masonText);
assert(flags.length === 2, "detects Reid and Leo flags from Mason");
assert(flags[0].targetAgent === "reid", "first flag is Reid");
assert(
  flags[0].context.includes("margin floor"),
  "Reid flag context extracted"
);
assert(flags[1].targetAgent === "leo", "second flag is Leo");

const redirectText =
  "Redirecting to Reid: Run a 90-day cash model on this contract.";
const redirectFlags = detectAgentFlags("mason", redirectText);
assert(redirectFlags[0]?.targetAgent === "reid", "Redirecting to Reid detected");

const satisfied = new Set(["mason", "reid", "leo"]);
const allFlags = detectAgentFlags("mason", masonText);
const wouldTrigger = allFlags.filter((f) => !satisfied.has(f.targetAgent));
assert(wouldTrigger.length === 0, "@all satisfied set skips Reid/Leo flags");

const followUp = buildFlagFollowUpUserMessage("Mason", "Check margin.");
assert(
  followUp.includes("[Mason] has flagged"),
  "follow-up message format"
);

console.log(failed ? `\n${failed} failed` : "\nAll flag tests passed");
process.exit(failed ? 1 : 0);
