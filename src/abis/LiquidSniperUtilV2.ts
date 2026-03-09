export const LiquidSniperUtilV2Abi = [
  {
    type: "function",
    name: "bidInAuction",
    inputs: [
      {
        name: "swapParams",
        type: "tuple",
        components: [
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
          { name: "zeroForOne", type: "bool" },
          { name: "amountIn", type: "uint128" },
          { name: "amountOutMinimum", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
      { name: "round", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "getTxGasPriceForBidAmount",
    inputs: [
      { name: "auctionGasPeg", type: "uint256" },
      { name: "desiredBidAmount", type: "uint256" },
    ],
    outputs: [{ name: "txGasPrice", type: "uint256" }],
    stateMutability: "view",
  },
] as const;
