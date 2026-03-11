import { ethers } from "ethers";

const BSC_RPC = process.env.BSC_RPC ?? "https://bsc-dataseed.binance.org";
const POOL_PRIVATE_KEY = process.env.POOL_PRIVATE_KEY ?? "";
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS ?? "";
const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS ?? "18", 10);

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

let provider: ethers.JsonRpcProvider | null = null;
let wallet: ethers.Wallet | null = null;
let tokenContract: ethers.Contract | null = null;

function hasRealValue(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;

  const placeholder = normalized.toLowerCase();
  return (
    placeholder !== "fill_me" &&
    placeholder !== "0xfill_me" &&
    placeholder !== "your_private_key_here" &&
    placeholder !== "0xyour_private_key_here" &&
    placeholder !== "your_token_address_here" &&
    placeholder !== "0xyour_token_address_here"
  );
}

function isConfigured(): boolean {
  return hasRealValue(POOL_PRIVATE_KEY) && hasRealValue(TOKEN_ADDRESS);
}

function init(): void {
  if (!isConfigured()) {
    console.warn("[Chain] Not configured - set POOL_PRIVATE_KEY and TOKEN_ADDRESS env vars");
    return;
  }

  try {
    provider = new ethers.JsonRpcProvider(BSC_RPC);
    wallet = new ethers.Wallet(POOL_PRIVATE_KEY, provider);
    tokenContract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, wallet);
    console.log(`[Chain] Pool wallet: ${wallet.address}`);
    console.log(`[Chain] Token: ${TOKEN_ADDRESS}`);
    console.log(`[Chain] RPC: ${BSC_RPC}`);
  } catch (err: any) {
    provider = null;
    wallet = null;
    tokenContract = null;
    console.warn(`[Chain] Invalid chain configuration: ${err.message}`);
  }
}

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

export async function getGasBalance(): Promise<number> {
  if (!provider || !wallet) return 0;

  try {
    const bal = await provider.getBalance(wallet.address);
    return parseFloat(ethers.formatEther(bal));
  } catch {
    return 0;
  }
}

export async function transferToken(
  toAddress: string,
  amount: number
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (!tokenContract || !wallet) {
    return { success: false, error: "Chain not configured" };
  }

  if (!ethers.isAddress(toAddress)) {
    return { success: false, error: "Invalid address" };
  }

  try {
    const amountWei = ethers.parseUnits(amount.toString(), TOKEN_DECIMALS);
    const balance: bigint = await tokenContract.balanceOf(wallet.address);

    if (balance < amountWei) {
      return {
        success: false,
        error: `Insufficient pool balance: have ${ethers.formatUnits(balance, TOKEN_DECIMALS)}, need ${amount}`,
      };
    }

    console.log(`[Chain] Sending ${amount} tokens to ${toAddress}...`);
    const tx = await tokenContract.transfer(toAddress, amountWei);
    const receipt = await tx.wait();

    console.log(`[Chain] TX confirmed: ${receipt.hash}`);
    return { success: true, txHash: receipt.hash };
  } catch (err: any) {
    console.error("[Chain] Transfer failed:", err.message);
    return { success: false, error: err.message };
  }
}

export async function batchTransfer(
  transfers: { address: string; amount: number }[]
): Promise<{ results: { address: string; amount: number; txHash?: string; error?: string }[] }> {
  const results: { address: string; amount: number; txHash?: string; error?: string }[] = [];

  for (const transfer of transfers) {
    const res = await transferToken(transfer.address, transfer.amount);
    results.push({
      address: transfer.address,
      amount: transfer.amount,
      txHash: res.txHash,
      error: res.error,
    });

    if (res.success) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
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

init();
