export const LiquidFeeLockerAbi = [
  {
    type: "function",
    name: "availableFees",
    inputs: [
      { name: "feeOwner", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "feesToClaim",
    inputs: [
      { name: "feeOwner", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "balance", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "claim",
    inputs: [
      { name: "feeOwner", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;
