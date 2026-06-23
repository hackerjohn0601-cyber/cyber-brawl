const fs = require('fs');
const lines = fs.readFileSync('/Users/johnjohn/.gemini/antigravity-ide/brain/e78f6bec-9e7d-4d62-b323-c75d730bdb17/.system_generated/logs/transcript.jsonl', 'utf8').split('\n');

for (const line of lines) {
  if (!line) continue;
  try {
    const obj = JSON.parse(line);
    if (obj.tool_calls) {
      for (const call of obj.tool_calls) {
        if (call.name === 'replace_file_content' && call.args && call.args.TargetFile && call.args.TargetFile.includes('Player.js')) {
          console.log(`\n\n=== STEP ${obj.step_index} ===`);
          console.log(call.args.Description);
          console.log("--- TARGET ---");
          console.log(call.args.TargetContent);
          console.log("--- REPLACEMENT ---");
          console.log(call.args.ReplacementContent);
        }
      }
    }
  } catch (e) {}
}
