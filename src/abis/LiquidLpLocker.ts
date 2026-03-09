export const LiquidLpLockerAbi = [
  {
    type: "function",
    name: "tokenRewards",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "token", type: "address" },
          {
            name: "poolKey",
            type: "tuple",
            components: [
              { name: "currency0", type: "address" },
              { name: "currency1", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
            ],
          },
          { name: "positionId", type: "uint256" },
          { name: "numPositions", type: "uint256" },
          { name: "rewardBps", type: "uint16[]" },
          { name: "rewardAdmins", type: "address[]" },
          { name: "rewardRecipients", type: "address[]" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "collectRewards",
    inputs: [{ name: "token", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "collectRewardsWithoutUnlock",
    inputs: [{ name: "token", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updateRewardAdmin",
    inputs: [
      { name: "token", type: "address" },
      { name: "rewardIndex", type: "uint256" },
      { name: "newAdmin", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updateRewardRecipient",
    inputs: [
      { name: "token", type: "address" },
      { name: "rewardIndex", type: "uint256" },
      { name: "newRecipient", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "version",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
] as const;
