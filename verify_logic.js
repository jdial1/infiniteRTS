const fs = require('fs');
const icons = JSON.parse(fs.readFileSync('data/icons.json', 'utf8'));

function getMascot(traits) {
  if (!traits || traits.length < 2) return null;
  const sorted = [...traits].sort();
  if (sorted.includes('speed') && sorted.includes('strength')) return icons.mascots.speed_strength;
  if (sorted.includes('speed') && sorted.includes('cost')) return icons.mascots.speed_cost;
  if (sorted.includes('strength') && sorted.includes('cost')) return icons.mascots.strength_cost;
  return null;
}

const testCases = [
  { traits: ['speed', 'strength'], expected: 'The Iron Jaguar' },
  { traits: ['strength', 'speed'], expected: 'The Iron Jaguar' },
  { traits: ['speed', 'cost'], expected: 'The Swift Falcon' },
  { traits: ['cost', 'strength'], expected: 'The Great Tusk' },
  { traits: ['speed'], expected: null }
];

testCases.forEach(tc => {
  const result = getMascot(tc.traits);
  const resultLabel = result ? result.label : null;
  if (resultLabel === tc.expected) {
    console.log(\`PASS: [\${tc.traits}] -> \${resultLabel}\`);
  } else {
    console.error(\`FAIL: [\${tc.traits}] -> Expected \${tc.expected}, got \${resultLabel}\`);
    process.exit(1);
  }
});
