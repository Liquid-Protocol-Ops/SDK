export const LiquidVaultAbi = [
  {
    type: "function",
    name: "allocation",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "token", type: "address" },
      { name: "amountTotal", type: "uint256" },
      { name: "amountClaimed", type: "uint256" },
      { name: "lockupEndTime", type: "uint256" },
      { name: "vestingEndTime", type: "uint256" },
      { name: "admin", type: "address" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "amountAvailableToClaim",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "claim",
    inputs: [{ name: "token", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;
