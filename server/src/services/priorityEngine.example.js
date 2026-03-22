import { processPriorityDecision } from "./priorityEngine.js";

const scenarios = [
  {
    name: "High priority - no response",
    input: {
      modelOutput: {
        fall_prob: 0.84,
        false_prob: 0.08,
        result: "REAL_FALL",
      },
      userInteraction: {
        user_response: "NO_RESPONSE",
        response_time: 11,
      },
      context: {
        location: "Home, Bedroom",
        triggerActions: false,
        userPermissionGranted: true,
        smsRecipients: ["+15550001111"],
      },
    },
  },
  {
    name: "Medium priority - user says NO",
    input: {
      modelOutput: {
        fall_prob: 0.78,
        false_prob: 0.12,
        result: "REAL_FALL",
      },
      userInteraction: {
        user_response: "NO",
        response_time: 4,
      },
      context: {
        location: "Garden",
        triggerActions: false,
        userPermissionGranted: true,
        smsRecipients: ["+15550002222"],
      },
    },
  },
  {
    name: "Low priority - user says YES",
    input: {
      modelOutput: {
        fall_prob: 0.71,
        false_prob: 0.2,
        result: "REAL_FALL",
      },
      userInteraction: {
        user_response: "YES",
        response_time: 2,
      },
      context: {
        location: "Kitchen",
        triggerActions: false,
        userPermissionGranted: true,
      },
    },
  },
  {
    name: "No event - false alarm",
    input: {
      modelOutput: {
        fall_prob: 0.13,
        false_prob: 0.88,
        result: "FALSE_ALARM",
      },
      userInteraction: {
        user_response: "YES",
        response_time: 1,
      },
      context: {
        location: "Hallway",
        triggerActions: false,
        userPermissionGranted: true,
      },
    },
  },
  {
    name: "Blocked SOS - permission not granted",
    input: {
      modelOutput: {
        fall_prob: 0.95,
        false_prob: 0.1,
        result: "REAL_FALL",
      },
      userInteraction: {
        user_response: "NO_RESPONSE",
        response_time: 12,
      },
      context: {
        location: "Stairs",
        triggerActions: true,
        userPermissionGranted: false,
        smsRecipients: ["+15550003333"],
      },
    },
  },
];

for (const scenario of scenarios) {
  const output = processPriorityDecision(scenario.input);
  console.log("\n===", scenario.name, "===");
  console.log("Input:", JSON.stringify(scenario.input, null, 2));
  console.log("Output:", JSON.stringify(output, null, 2));
}
