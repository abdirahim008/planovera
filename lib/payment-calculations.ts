import type { PaymentCertificate, PaymentItem } from "./supabase";
import { calculateBOQLineAmount, isPercentageUnit } from "./boq-calculations";

export const parsePaymentNumber = (value: string | number | undefined | null) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return parseFloat(String(value ?? "0").replace(/,/g, "")) || 0;
};

const hasExplicitNumber = (value: string | number | undefined | null) =>
  value !== undefined && value !== null && String(value).trim() !== "";

export const inverseBOQLineAmount = (amount: number, rate: number, unit: string) => {
  if (!rate) return 0;
  return isPercentageUnit(unit) ? (amount * 100) / rate : amount / rate;
};

export const paymentLineState = (item: PaymentItem) => {
  const boqQty = parsePaymentNumber(item.boqQty);
  const rate = parsePaymentNumber(item.boqRate);
  const boqAmount =
    parsePaymentNumber(item.boqAmount) || calculateBOQLineAmount(boqQty, rate, item.unit);
  const previousAmount = parsePaymentNumber(item.previousAmount);
  const previousQty = hasExplicitNumber(item.previousQty)
    ? parsePaymentNumber(item.previousQty)
    : inverseBOQLineAmount(previousAmount, rate, item.unit);
  const currentQty = hasExplicitNumber(item.currentQty)
    ? parsePaymentNumber(item.currentQty)
    : Math.max(0, parsePaymentNumber(item.totalQty) - previousQty);
  const totalQty = hasExplicitNumber(item.totalQty)
    ? parsePaymentNumber(item.totalQty)
    : previousQty + currentQty;
  const currentAmount = hasExplicitNumber(item.currentAmount)
    ? parsePaymentNumber(item.currentAmount)
    : calculateBOQLineAmount(currentQty, rate, item.unit);
  const totalAmount = hasExplicitNumber(item.totalAmount)
    ? parsePaymentNumber(item.totalAmount)
    : previousAmount + currentAmount;
  const balanceQty = boqQty - totalQty;
  const isOverCertified = totalQty > boqQty + 0.0001 || totalAmount > boqAmount + 0.01;
  const warningStatus: PaymentItem["warningStatus"] = isOverCertified
    ? item.overrideNote?.trim()
      ? "overridden"
      : "over-certified"
    : "ok";

  return {
    boqQty,
    rate,
    boqAmount,
    previousQty,
    previousAmount,
    currentQty,
    currentAmount,
    totalQty,
    totalAmount,
    balanceQty,
    warningStatus,
  };
};

const percentAmount = (base: number, percent: number | undefined) =>
  (base * parsePaymentNumber(percent)) / 100;

export const paymentCertificateCalcs = (cert: PaymentCertificate) => {
  const allItems = cert.sheets.flatMap((sheet) => sheet.items);
  const itemStates = allItems.map(paymentLineState);
  const boqSubTotal = itemStates.reduce((sum, item) => sum + item.boqAmount, 0);
  const prevSubTotal = itemStates.reduce((sum, item) => sum + item.previousAmount, 0);
  const currSubTotal = itemStates.reduce((sum, item) => sum + item.currentAmount, 0);
  const totalSubTotal = itemStates.reduce((sum, item) => sum + item.totalAmount, 0);

  const calcGross = (subTotal: number) => {
    // Contingency and government tax are no longer certificate-level percentages
    // — those belong in the BOQ as line items. Gross valuation is therefore the
    // certified BOQ subtotal directly. The remaining certificate-level
    // deductions (retention, withholding) still apply to the gross.
    const grand = subTotal;
    const ret = percentAmount(grand, cert.retentionPercent);
    const wh = percentAmount(grand, cert.withholdingTaxPercent);
    return { grand, ret, wh };
  };

  const boq = calcGross(boqSubTotal);
  const prev = calcGross(prevSubTotal);
  const curr = calcGross(currSubTotal);
  const total = calcGross(totalSubTotal);
  const advancePaymentAmount = hasExplicitNumber(cert.advancePaymentAmount)
    ? parsePaymentNumber(cert.advancePaymentAmount)
    : percentAmount(boq.grand, cert.advancePaymentPercent);
  const previousAdvanceRecovered = hasExplicitNumber(cert.advanceRecoveredPrevious)
    ? parsePaymentNumber(cert.advanceRecoveredPrevious)
    : 0;
  const outstandingAdvance = Math.max(0, advancePaymentAmount - previousAdvanceRecovered);

  const retentionReleaseAmount = hasExplicitNumber(cert.retentionReleaseAmount)
    ? parsePaymentNumber(cert.retentionReleaseAmount)
    : cert.type === "final"
      ? prev.ret + curr.ret
      : 0;

  const additions = (cert.adjustments ?? [])
    .filter((line) => line.type === "addition")
    .reduce((sum, line) => sum + parsePaymentNumber(line.amount), 0);
  const deductions = (cert.adjustments ?? [])
    .filter((line) => line.type === "deduction")
    .reduce((sum, line) => sum + parsePaymentNumber(line.amount), 0);

  // Net payable this period BEFORE advance recovery. Recovery is capped to this
  // so an over-large sweep can never push a certificate's net negative.
  const payableBeforeAdvance =
    curr.grand + additions + retentionReleaseAmount - curr.ret - curr.wh - deductions;

  // Advance recovery — cumulative method: recover up to (recovery% x cumulative
  // work done) less what's already been recovered, becoming active once the
  // certificate reaches the configured start IPC. Precedence: an explicit
  // "recover full remaining" sweep, then a manual entry, then the cumulative
  // auto amount (and a legacy final-certificate sweep).
  const recoveryStartIpc =
    cert.advanceRecoveryStartIpc && cert.advanceRecoveryStartIpc > 0 ? cert.advanceRecoveryStartIpc : 1;
  const recoveryActive = (cert.number ?? 1) >= recoveryStartIpc;
  const cumulativeRecoveryTarget = Math.min(
    advancePaymentAmount,
    percentAmount(total.grand, cert.advancePaymentPercent)
  );
  const autoCurrentRecovery = recoveryActive
    ? Math.max(0, cumulativeRecoveryTarget - previousAdvanceRecovered)
    : 0;

  let currentAdvanceRecovery: number;
  if (cert.advanceRecoverFull) {
    currentAdvanceRecovery = outstandingAdvance;
  } else if (hasExplicitNumber(cert.advanceRecoveryCurrent)) {
    currentAdvanceRecovery = parsePaymentNumber(cert.advanceRecoveryCurrent);
  } else if (cert.type === "final") {
    currentAdvanceRecovery = outstandingAdvance;
  } else {
    currentAdvanceRecovery = autoCurrentRecovery;
  }
  // Never recover more than is outstanding, nor more than the certificate pays.
  currentAdvanceRecovery = Math.max(
    0,
    Math.min(currentAdvanceRecovery, outstandingAdvance, Math.max(0, payableBeforeAdvance))
  );

  const prevNet = prev.grand - prev.ret - previousAdvanceRecovered - prev.wh;
  const currNet = payableBeforeAdvance - currentAdvanceRecovery;
  const totalNet = prevNet + currNet;
  const advanceRecoveredTotal = previousAdvanceRecovered + currentAdvanceRecovery;
  const advanceBalance = Math.max(0, advancePaymentAmount - advanceRecoveredTotal);
  const retentionHeld = Math.max(0, prev.ret + curr.ret - retentionReleaseAmount);
  // Share of the contract certified to date — drives the "recover the advance"
  // warnings as the works approach completion.
  const completionPercent = boqSubTotal > 0 ? (totalSubTotal / boqSubTotal) * 100 : 0;
  const unresolvedWarnings = allItems.filter(
    (item) => paymentLineState(item).warningStatus === "over-certified"
  ).length;

  return {
    boqSubTotal,
    prevSubTotal,
    currSubTotal,
    totalSubTotal,
    boq,
    prev: { ...prev, advance: previousAdvanceRecovered, net: prevNet },
    curr: {
      ...curr,
      additions,
      deductions,
      advance: currentAdvanceRecovery,
      retentionRelease: retentionReleaseAmount,
      net: currNet,
    },
    total: {
      ...total,
      advance: advanceRecoveredTotal,
      advanceBalance,
      retentionHeld,
      net: totalNet,
    },
    advancePaymentAmount,
    previousAdvanceRecovered,
    currentAdvanceRecovery,
    outstandingAdvance,
    retentionReleaseAmount,
    additions,
    deductions,
    completionPercent,
    unresolvedWarnings,
  };
};
