import { useEffect, useMemo, useState } from "react";
import { formatUnits, isAddress, parseUnits } from "viem";
import { useAccount, useChainId, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { erc20MarketAbi, marketFactoryAbi, predictionMarketAbi, resolutionManagerAbi } from "./abis";
import { marketAddresses } from "./addresses";

const zeroAddress = "0x0000000000000000000000000000000000000000";
const yesNoLabels: Record<number, string> = { 1: "YES", 2: "NO", 3: "Cancelled" };

function asAddress(value: string | undefined): `0x${string}` | undefined {
  return value && isAddress(value) ? value : undefined;
}

function asBytes32(value: string): `0x${string}` | undefined {
  return /^0x[0-9a-fA-F]{64}$/.test(value) ? (value as `0x${string}`) : undefined;
}

function friendlyError(error: unknown) {
  if (!error) return "";
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("User rejected")) return "Transaction rejected in wallet.";
  if (message.includes("insufficient funds")) return "Wallet has insufficient funds for gas.";
  if (message.includes("InvalidCloseTime")) return "Close time must be in the future.";
  if (message.includes("UnauthorizedResolver")) return "Wallet does not have resolver permission.";
  if (message.includes("MarketNotRegistered")) return "Market is not registered in the resolution manager.";
  return "Transaction failed. Check addresses, network, balances, approvals, and permissions.";
}

function futureTimestamp(hoursFromNow: number) {
  return Math.floor(Date.now() / 1000) + hoursFromNow * 60 * 60;
}

export function PredictionMarketDashboard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const configured = marketAddresses[chainId];
  const [factoryAddress, setFactoryAddress] = useState(configured?.marketFactory ?? "");
  const [marketAddressInput, setMarketAddressInput] = useState(
    configured?.predictionMarket !== zeroAddress ? configured?.predictionMarket ?? "" : ""
  );
  const [collateralAddressInput, setCollateralAddressInput] = useState(
    configured?.collateralToken !== zeroAddress ? configured?.collateralToken ?? "" : ""
  );
  const [resolutionAddressInput, setResolutionAddressInput] = useState(
    configured?.resolutionManager !== zeroAddress ? configured?.resolutionManager ?? "" : ""
  );
  const [oracleAddressInput, setOracleAddressInput] = useState(
    configured?.oracleAdapter !== zeroAddress ? configured?.oracleAdapter ?? "" : ""
  );
  const [question, setQuestion] = useState("Will ETH close above 5000 USD?");
  const [closeTime, setCloseTime] = useState(String(futureTimestamp(24)));
  const [feeBps, setFeeBps] = useState("30");
  const [liquidityAmount, setLiquidityAmount] = useState("100");
  const [buyAmount, setBuyAmount] = useState("10");
  const [selectedOutcome, setSelectedOutcome] = useState<1 | 2>(1);
  const [marketIdInput, setMarketIdInput] = useState("");
  const [resolutionOutcome, setResolutionOutcome] = useState<1 | 2>(1);
  const [thresholdPrice, setThresholdPrice] = useState("200000000000");
  const [claimAmount, setClaimAmount] = useState("10");
  const [disputeReason, setDisputeReason] = useState("oracle answer mismatch");

  useEffect(() => {
    if (!configured) return;
    setFactoryAddress(configured.marketFactory);
    if (configured.predictionMarket !== zeroAddress) setMarketAddressInput(configured.predictionMarket);
    if (configured.collateralToken !== zeroAddress) setCollateralAddressInput(configured.collateralToken);
    if (configured.resolutionManager !== zeroAddress) setResolutionAddressInput(configured.resolutionManager);
    if (configured.oracleAdapter !== zeroAddress) setOracleAddressInput(configured.oracleAdapter);
  }, [configured]);

  const factory = asAddress(factoryAddress);
  const market = asAddress(marketAddressInput);
  const collateral = asAddress(collateralAddressInput);
  const resolutionManager = asAddress(resolutionAddressInput);
  const oracleAdapter = asAddress(oracleAddressInput);
  const marketId = asBytes32(marketIdInput);

  const { data: txHash, error, isPending, writeContract } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: txHash });

  const decimals = useReadContract({
    address: collateral,
    abi: erc20MarketAbi,
    functionName: "decimals",
    query: { enabled: Boolean(collateral) }
  });
  const symbol = useReadContract({
    address: collateral,
    abi: erc20MarketAbi,
    functionName: "symbol",
    query: { enabled: Boolean(collateral) }
  });
  const collateralBalance = useReadContract({
    address: collateral,
    abi: erc20MarketAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && collateral) }
  });
  const marketAllowance = useReadContract({
    address: collateral,
    abi: erc20MarketAbi,
    functionName: "allowance",
    args: address && market ? [address, market] : undefined,
    query: { enabled: Boolean(address && collateral && market) }
  });
  const resolutionAllowance = useReadContract({
    address: collateral,
    abi: erc20MarketAbi,
    functionName: "allowance",
    args: address && resolutionManager ? [address, resolutionManager] : undefined,
    query: { enabled: Boolean(address && collateral && resolutionManager) }
  });
  const marketQuestion = useReadContract({
    address: market,
    abi: predictionMarketAbi,
    functionName: "question",
    query: { enabled: Boolean(market) }
  });
  const onchainMarketId = useReadContract({
    address: market,
    abi: predictionMarketAbi,
    functionName: "marketId",
    query: { enabled: Boolean(market) }
  });
  const closeTimeRead = useReadContract({
    address: market,
    abi: predictionMarketAbi,
    functionName: "closeTime",
    query: { enabled: Boolean(market) }
  });
  const marketFee = useReadContract({
    address: market,
    abi: predictionMarketAbi,
    functionName: "feeBps",
    query: { enabled: Boolean(market) }
  });
  const yesReserve = useReadContract({
    address: market,
    abi: predictionMarketAbi,
    functionName: "yesReserve",
    query: { enabled: Boolean(market) }
  });
  const noReserve = useReadContract({
    address: market,
    abi: predictionMarketAbi,
    functionName: "noReserve",
    query: { enabled: Boolean(market) }
  });
  const totalLiquidity = useReadContract({
    address: market,
    abi: predictionMarketAbi,
    functionName: "totalLiquidity",
    query: { enabled: Boolean(market) }
  });

  useEffect(() => {
    if (onchainMarketId.data && !marketIdInput) {
      setMarketIdInput(onchainMarketId.data);
    }
  }, [marketIdInput, onchainMarketId.data]);

  const tokenDecimals = decimals.data ?? 18;
  const liquidityWei = useMemo(() => parseTokenInput(liquidityAmount, tokenDecimals), [liquidityAmount, tokenDecimals]);
  const buyWei = useMemo(() => parseTokenInput(buyAmount, tokenDecimals), [buyAmount, tokenDecimals]);
  const claimWei = useMemo(() => parseTokenInput(claimAmount, tokenDecimals), [claimAmount, tokenDecimals]);

  const quote = useReadContract({
    address: market,
    abi: predictionMarketAbi,
    functionName: "quoteBuy",
    args: buyWei > 0n ? [selectedOutcome, buyWei] : undefined,
    query: { enabled: Boolean(market && buyWei > 0n && (yesReserve.data ?? 0n) > 0n && (noReserve.data ?? 0n) > 0n) }
  });
  const resolution = useReadContract({
    address: resolutionManager,
    abi: resolutionManagerAbi,
    functionName: "getResolution",
    args: marketId ? [marketId] : undefined,
    query: { enabled: Boolean(resolutionManager && marketId) }
  });

  function createMarket() {
    if (!factory || !collateral || !oracleAdapter || !question || !closeTime || !feeBps) return;
    writeContract({
      address: factory,
      abi: marketFactoryAbi,
      functionName: "createMarket",
      args: [question, BigInt(closeTime), collateral, oracleAdapter, BigInt(feeBps)]
    });
  }

  function approveMarket() {
    if (!collateral || !market || liquidityWei + buyWei === 0n) return;
    writeContract({
      address: collateral,
      abi: erc20MarketAbi,
      functionName: "approve",
      args: [market, liquidityWei + buyWei]
    });
  }

  function addLiquidity() {
    if (!market || liquidityWei === 0n) return;
    writeContract({
      address: market,
      abi: predictionMarketAbi,
      functionName: "addLiquidity",
      args: [liquidityWei]
    });
  }

  function buyOutcome() {
    if (!market || buyWei === 0n || !quote.data) return;
    writeContract({
      address: market,
      abi: predictionMarketAbi,
      functionName: "buyOutcome",
      args: [selectedOutcome, buyWei, quote.data]
    });
  }

  function approveResolutionManager() {
    if (!collateral || !resolutionManager || claimWei === 0n) return;
    writeContract({
      address: collateral,
      abi: erc20MarketAbi,
      functionName: "approve",
      args: [resolutionManager, claimWei]
    });
  }

  function depositPayoutCollateral() {
    if (!resolutionManager || !marketId || claimWei === 0n) return;
    writeContract({
      address: resolutionManager,
      abi: resolutionManagerAbi,
      functionName: "depositCollateral",
      args: [marketId, claimWei]
    });
  }

  function resolveManual() {
    if (!resolutionManager || !marketId) return;
    writeContract({
      address: resolutionManager,
      abi: resolutionManagerAbi,
      functionName: "resolveMarket",
      args: [marketId, resolutionOutcome]
    });
  }

  function resolveFromOracle() {
    if (!resolutionManager || !marketId || !oracleAdapter || !thresholdPrice) return;
    writeContract({
      address: resolutionManager,
      abi: resolutionManagerAbi,
      functionName: "resolveMarketFromOracle",
      args: [marketId, oracleAdapter, BigInt(thresholdPrice)]
    });
  }

  function startDispute() {
    if (!resolutionManager || !marketId || !disputeReason) return;
    writeContract({
      address: resolutionManager,
      abi: resolutionManagerAbi,
      functionName: "startDispute",
      args: [marketId, disputeReason]
    });
  }

  function finalizeResolution() {
    if (!resolutionManager || !marketId) return;
    writeContract({
      address: resolutionManager,
      abi: resolutionManagerAbi,
      functionName: "finalizeResolution",
      args: [marketId]
    });
  }

  function claimPayout() {
    if (!resolutionManager || !marketId || claimWei === 0n) return;
    writeContract({
      address: resolutionManager,
      abi: resolutionManagerAbi,
      functionName: "claim",
      args: [marketId, claimWei]
    });
  }

  if (!isConnected) {
    return <section className="panel">Connect wallet to use markets.</section>;
  }

  return (
    <section className="panel market-panel">
      <header className="panel-header">
        <div>
          <h2>Prediction Market</h2>
          <p>{marketQuestion.data ?? "No market selected"}</p>
        </div>
        <div className="stat-grid">
          <span>YES {formatToken(yesReserve.data, tokenDecimals)}</span>
          <span>NO {formatToken(noReserve.data, tokenDecimals)}</span>
          <span>Liquidity {formatToken(totalLiquidity.data, tokenDecimals)}</span>
          <span>Fee {String(marketFee.data ?? 0n)} bps</span>
        </div>
      </header>

      <div className="market-layout">
        <div className="market-section">
          <h3>Addresses</h3>
          <AddressInput label="Factory" value={factoryAddress} onChange={setFactoryAddress} />
          <AddressInput label="Market" value={marketAddressInput} onChange={setMarketAddressInput} />
          <AddressInput label="Collateral" value={collateralAddressInput} onChange={setCollateralAddressInput} />
          <AddressInput label="Resolution" value={resolutionAddressInput} onChange={setResolutionAddressInput} />
          <AddressInput label="Oracle" value={oracleAddressInput} onChange={setOracleAddressInput} />
        </div>

        <div className="market-section">
          <h3>Create</h3>
          <label>
            Question
            <input value={question} onChange={(event) => setQuestion(event.target.value)} />
          </label>
          <label>
            Close time
            <input value={closeTime} onChange={(event) => setCloseTime(event.target.value)} inputMode="numeric" />
          </label>
          <label>
            Fee bps
            <input value={feeBps} onChange={(event) => setFeeBps(event.target.value)} inputMode="numeric" />
          </label>
          <button type="button" onClick={createMarket} disabled={isPending || !factory || !collateral || !oracleAdapter}>
            Create Market
          </button>
        </div>
      </div>

      <div className="market-layout">
        <div className="market-section">
          <h3>Trade</h3>
          <div className="stat-grid">
            <span>Balance {formatToken(collateralBalance.data, tokenDecimals)} {symbol.data ?? ""}</span>
            <span>Allowance {formatToken(marketAllowance.data, tokenDecimals)}</span>
            <span>Quote {formatToken(quote.data, tokenDecimals)}</span>
            <span>Close {closeTimeRead.data ? new Date(Number(closeTimeRead.data) * 1000).toLocaleString() : "-"}</span>
          </div>
          <label>
            Liquidity amount
            <input value={liquidityAmount} onChange={(event) => setLiquidityAmount(event.target.value)} inputMode="decimal" />
          </label>
          <label>
            Buy amount
            <input value={buyAmount} onChange={(event) => setBuyAmount(event.target.value)} inputMode="decimal" />
          </label>
          <div className="segmented">
            <button type="button" onClick={() => setSelectedOutcome(1)} aria-pressed={selectedOutcome === 1}>
              YES
            </button>
            <button type="button" onClick={() => setSelectedOutcome(2)} aria-pressed={selectedOutcome === 2}>
              NO
            </button>
          </div>
          <div className="action-row">
            <button type="button" onClick={approveMarket} disabled={isPending || !market || !collateral}>
              Approve Market
            </button>
            <button type="button" onClick={addLiquidity} disabled={isPending || !market || liquidityWei === 0n}>
              Add Liquidity
            </button>
            <button type="button" onClick={buyOutcome} disabled={isPending || !market || buyWei === 0n || !quote.data}>
              Buy {yesNoLabels[selectedOutcome]}
            </button>
          </div>
        </div>

        <div className="market-section">
          <h3>Resolve</h3>
          <label>
            Market id
            <input value={marketIdInput} onChange={(event) => setMarketIdInput(event.target.value)} />
          </label>
          <label>
            Threshold price
            <input value={thresholdPrice} onChange={(event) => setThresholdPrice(event.target.value)} inputMode="numeric" />
          </label>
          <label>
            Claim/deposit amount
            <input value={claimAmount} onChange={(event) => setClaimAmount(event.target.value)} inputMode="decimal" />
          </label>
          <label>
            Dispute reason
            <input value={disputeReason} onChange={(event) => setDisputeReason(event.target.value)} />
          </label>
          <div className="segmented">
            <button type="button" onClick={() => setResolutionOutcome(1)} aria-pressed={resolutionOutcome === 1}>
              YES
            </button>
            <button type="button" onClick={() => setResolutionOutcome(2)} aria-pressed={resolutionOutcome === 2}>
              NO
            </button>
          </div>
          <div className="stat-grid">
            <span>Resolved {resolution.data?.resolved ? yesNoLabels[resolution.data.outcome] : "No"}</span>
            <span>Finalized {resolution.data?.finalized ? "Yes" : "No"}</span>
            <span>Disputed {resolution.data?.disputed ? "Yes" : "No"}</span>
            <span>Resolution allowance {formatToken(resolutionAllowance.data, tokenDecimals)}</span>
          </div>
          <div className="action-row">
            <button type="button" onClick={approveResolutionManager} disabled={isPending || !resolutionManager || !collateral}>
              Approve Payout
            </button>
            <button type="button" onClick={depositPayoutCollateral} disabled={isPending || !resolutionManager || !marketId}>
              Fund Payout
            </button>
            <button type="button" onClick={resolveManual} disabled={isPending || !resolutionManager || !marketId}>
              Resolve
            </button>
            <button type="button" onClick={resolveFromOracle} disabled={isPending || !resolutionManager || !oracleAdapter || !marketId}>
              Resolve Oracle
            </button>
            <button type="button" onClick={startDispute} disabled={isPending || !resolutionManager || !marketId}>
              Dispute
            </button>
            <button type="button" onClick={finalizeResolution} disabled={isPending || !resolutionManager || !marketId}>
              Finalize
            </button>
            <button type="button" onClick={claimPayout} disabled={isPending || !resolutionManager || !marketId}>
              Claim
            </button>
          </div>
        </div>
      </div>

      {receipt.isSuccess && <p className="success">Transaction confirmed.</p>}
      {error && <p className="error">{friendlyError(error)}</p>}
    </section>
  );
}

function parseTokenInput(value: string, decimals: number) {
  try {
    return value ? parseUnits(value, decimals) : 0n;
  } catch {
    return 0n;
  }
}

function formatToken(value: bigint | undefined, decimals: number) {
  return formatUnits(value ?? 0n, decimals);
}

function AddressInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} />
    </label>
  );
}
