import { ethers } from "ethers";

// ─── Config via env ───
const BSC_RPC = process.env.BSC_RPC ?? "https://bsc-dataseed.binance.org";
const POOL_PRIVATE_KEY = process.env.POOL_PRIVATE_KEY ?? "";        // 池子钱包私钥
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS ?? "";              // BEP-20 代币合约地址
const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS ?? "18");

// Minimal BEP-20 ABI (only what we need)
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

let provider: ethers.JsonRpcProvider | null = null;
let wallet: ethers.Wallet | null = null;
let tokenContract: ethers.Contract | null = null;

function isConfigured(): boolean {
  return !!POOL_PRIVATE_KEY && !!TOKEN_ADDRESS;
}

function init(): void {
  if (!isConfigured()) {
    console.warn("[Chain] Not configured — set POOL_PRIVATE_KEY and TOKEN_ADDRESS env vars");
    return;
  }
  provider = new ethers.JsonRpcProvider(BSC_RPC);
  wallet = new ethers.Wallet(POOL_PRIVATE_KEY, provider);
  tokenContract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, wallet);
  console.log(`[Chain] Pool wallet: ${wallet.address}`);
  console.log(`[Chain] Token: ${TOKEN_ADDRESS}`);
  console.log(`[Chain] RPC: ${BSC_RPC}`);
}

// ─── Public API ───

/** 获取池子钱包的代币余额 */
export async function getPoolBalance(): Promise<{ balance: number; raw: string; address: string }> {
  if (!tokenContract || !wallet) {
    return { balance: 0, raw: "0", address: "not-configured" };
  }
  try {
    const raw: bigint = await tokenContract.balanceOf(wallet.address);
    const balance = parseFloat(ethers.formatUnits(raw, TOKEN_DECIMALS));
    return { balance, raw: raw.toString(), address: wallet.address };
  } catch (err: any) {
    console.error("[Chain] Failed to get balance:", err.message);
    return { balance: 0, raw: "0", address: wallet.address };
  }
}

/** 获取池子钱包的 BNB 余额（用于 gas） */
export async function getGasBalance(): Promise<number> {
  if (!provider || !wallet) return 0;
  try {
    const bal = await provider.getBalance(wallet.address);
    return parseFloat(ethers.formatEther(bal));
  } catch {
    return 0;
  }
}

/** 转代币给指定地址 */
export async function transferToken(
  toAddress: string,
  amount: number
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (!tokenContract || !wallet) {
    return { success: false, error: "Chain not configured" };
  }

  // 校验地址
  if (!ethers.isAddress(toAddress)) {
    return { success: false, error: "Invalid address" };
  }

  try {
    const amountWei = ethers.parseUnits(amount.toString(), TOKEN_DECIMALS);

    // 检查余额
    const balance: bigint = await tokenContract.balanceOf(wallet.address);
    if (balance < amountWei) {
      return { success: false, error: `Insufficient pool balance: have ${ethers.formatUnits(balance, TOKEN_DECIMALS)}, need ${amount}` };
    }

    console.log(`[Chain] Sending ${amount} tokens to ${toAddress}...`);
    const tx = await tokenContract.transfer(toAddress, amountWei);
    const receipt = await tx.wait();

    console.log(`[Chain] TX confirmed: ${receipt.hash}`);
    return { success: true, txHash: receipt.hash };
  } catch (err: any) {
    console.error(`[Chain] Transfer failed:`, err.message);
    return { success: false, error: err.message };
  }
}

/** 批量转账（用于 epoch 自动分配） */
export async function batchTransfer(
  transfers: { address: string; amount: number }[]
): Promise<{ results: { address: string; amount: number; txHash?: string; error?: string }[] }> {
  const results: { address: string; amount: number; txHash?: string; error?: string }[] = [];

  for (const t of transfers) {
    const res = await transferToken(t.address, t.amount);
    results.push({
      address: t.address,
      amount: t.amount,
      txHash: res.txHash,
      error: res.error,
    });
    // 等一下避免 nonce 冲突
    if (res.success) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return { results };
}

export function getChainStatus() {
  return {
    configured: isConfigured(),
    rpc: BSC_RPC,
    tokenAddress: TOKEN_ADDRESS || "not-set",
    poolAddress: wallet?.address ?? "not-set",
    decimals: TOKEN_DECIMALS,
  };
}

// Init on import
init();
