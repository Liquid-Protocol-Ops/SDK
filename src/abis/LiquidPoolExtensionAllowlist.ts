export const LiquidPoolExtensionAllowlistAbi = [
  {
    type: "function",
    name: "enabledExtensions",
    inputs: [{ name: "extension", type: "address" }],
    outputs: [{ name: "enabled", type: "bool" }],
    stateMutability: "view",
  },
] as const;
