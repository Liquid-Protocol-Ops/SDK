export const LiquidTokenAbi = [
  {
    type: "function",
    name: "updateImage",
    inputs: [{ name: "image_", type: "string" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updateMetadata",
    inputs: [{ name: "metadata_", type: "string" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updateAdmin",
    inputs: [{ name: "admin_", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "UpdateImage",
    inputs: [{ name: "image", type: "string", indexed: false }],
    anonymous: false,
  },
  {
    type: "event",
    name: "UpdateMetadata",
    inputs: [{ name: "metadata", type: "string", indexed: false }],
    anonymous: false,
  },
  {
    type: "event",
    name: "UpdateAdmin",
    inputs: [
      { name: "oldAdmin", type: "address", indexed: false },
      { name: "newAdmin", type: "address", indexed: false },
    ],
    anonymous: false,
  },
] as const;
