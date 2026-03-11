/**
 * BSC Testnet 链上测试脚本
 *
 * 使用前需要:
 * 1. 一个 BSC 测试网钱包（有测试 BNB）
 *    获取测试 BNB: https://www.bnbchain.org/en/testnet-faucet
 *
 * 2. 部署一个测试 BEP-20 代币（或用已有的测试代币）
 *
 * 用法:
 *   npx tsx scripts/test-chain.ts
 *
 * 环境变量:
 *   POOL_PRIVATE_KEY=0x...     热钱包私钥
 *   TOKEN_ADDRESS=0x...        代币合约地址
 *   BSC_RPC=https://...        BSC 测试网 RPC
 *   TOKEN_DECIMALS=18          代币精度
 */

import { ethers } from "ethers";

const BSC_TESTNET_RPC = process.env.BSC_RPC ?? "https://data-seed-prebsc-1-s1.binance.org:8545";
const PRIVATE_KEY = process.env.POOL_PRIVATE_KEY ?? "";
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS ?? "";
const DECIMALS = parseInt(process.env.TOKEN_DECIMALS ?? "18");

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
];

async function main() {
  if (!PRIVATE_KEY) {
    console.log("❌ 请设置 POOL_PRIVATE_KEY 环境变量");
    console.log("\n示例:");
    console.log("  $env:POOL_PRIVATE_KEY='0xabc...'");
    console.log("  $env:TOKEN_ADDRESS='0xdef...'");
    console.log("  $env:BSC_RPC='https://data-seed-prebsc-1-s1.binance.org:8545'");
    console.log("  npx tsx scripts/test-chain.ts");
    return;
  }

  console.log("🔗 连接 BSC...");
  console.log(`   RPC: ${BSC_TESTNET_RPC}`);

  const provider = new ethers.JsonRpcProvider(BSC_TESTNET_RPC);
  const network = await provider.getNetwork();
  console.log(`   Chain ID: ${network.chainId}`);

  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log(`   钱包地址: ${wallet.address}`);

  // BNB balance
  const bnbBalance = await provider.getBalance(wallet.address);
  console.log(`   BNB 余额: ${ethers.formatEther(bnbBalance)} BNB`);

  if (!TOKEN_ADDRESS) {
    console.log("\n⚠️  TOKEN_ADDRESS 未设置，跳过代币测试");
    console.log("   你可以先部署代币，然后设置 TOKEN_ADDRESS 再运行");
    return;
  }

  // Token info
  const token = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, wallet);

  try {
    const name = await token.name();
    const symbol = await token.symbol();
    const decimals = await token.decimals();
    const balance = await token.balanceOf(wallet.address);

    console.log(`\n💰 代币信息:`);
    console.log(`   名称: ${name} (${symbol})`);
    console.log(`   精度: ${decimals}`);
    console.log(`   余额: ${ethers.formatUnits(balance, decimals)} ${symbol}`);

    if (balance === 0n) {
      console.log("\n⚠️  钱包代币余额为 0，请先往这个地址转入代币");
      return;
    }

    console.log("\n✅ 链上配置正确！可以开始部署了");
    console.log("\n📋 .env 配置:");
    console.log(`   POOL_PRIVATE_KEY=${PRIVATE_KEY}`);
    console.log(`   TOKEN_ADDRESS=${TOKEN_ADDRESS}`);
    console.log(`   BSC_RPC=${BSC_TESTNET_RPC}`);
    console.log(`   TOKEN_DECIMALS=${decimals}`);

  } catch (err: any) {
    console.error(`\n❌ 代币合约读取失败: ${err.message}`);
    console.log("   请检查 TOKEN_ADDRESS 是否正确");
  }
}

main().catch(console.error);
